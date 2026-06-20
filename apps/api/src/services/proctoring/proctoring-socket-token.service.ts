import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { AppException } from '@backend/api/exceptions/base.exception';
import { AuthenticationException, AuthorizationException } from '@backend/api/exceptions/auth.exceptions';
import { ExamParticipationRepository } from '@backend/api/repositories/examParticipation.repository';
import { ProctoringSessionRepository } from '@backend/api/repositories/proctoring/proctoringSession.repository';
import {
  createProctoringRedisService,
  ProctoringRedisService,
} from '@backend/api/services/proctoring/proctoring-redis.service';
import {
  ProctoringSocketTokenClaims,
  ProctoringSocketTokenResponse,
} from '@backend/shared/types/proctoring.types';

const PURPOSE = 'proctoring_socket';
const DEFAULT_TTL_SECONDS = 120;

type ParticipationRepositoryLike = Pick<ExamParticipationRepository, 'findById'>;
type SessionRepositoryLike = Pick<
  ProctoringSessionRepository,
  'findActiveByParticipationAndClientSession'
>;
type RedisServiceLike = Pick<ProctoringRedisService, 'consumeSocketTokenJti'>;

export type IssueProctoringSocketTokenInput = {
  participationId: string;
  userId?: string;
  clientSessionId: string;
};

export type VerifyProctoringSocketTokenInput = {
  token: string;
  participationId: string;
  clientSessionId: string;
  userId?: string;
};

export type ProctoringSocketTokenServiceDependencies = {
  participationRepository?: ParticipationRepositoryLike;
  sessionRepository?: SessionRepositoryLike;
  redisService?: RedisServiceLike;
  nowFactory?: () => Date;
  randomIdFactory?: () => string;
  ttlSeconds?: number;
};

function getSocketTokenSecret(): string {
  const secret = process.env.PROCTORING_SOCKET_TOKEN_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'test') {
    return 'test-proctoring-socket-token-secret';
  }
  throw new Error('PROCTORING_SOCKET_TOKEN_SECRET must be configured');
}

function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function decodeVerifiedClaims(token: string): ProctoringSocketTokenClaims {
  const decoded = jwt.verify(token, getSocketTokenSecret()) as jwt.JwtPayload & Record<string, unknown>;
  if (decoded.purpose !== PURPOSE) {
    throw new AppException('Invalid proctoring socket token purpose', 401, 'INVALID_PROCTORING_SOCKET_TOKEN');
  }
  if (
    typeof decoded.sub !== 'string' ||
    typeof decoded.userId !== 'string' ||
    typeof decoded.examId !== 'string' ||
    typeof decoded.participationId !== 'string' ||
    typeof decoded.clientSessionId !== 'string' ||
    typeof decoded.jti !== 'string'
  ) {
    throw new AppException('Invalid proctoring socket token claims', 401, 'INVALID_PROCTORING_SOCKET_TOKEN');
  }

  return decoded as ProctoringSocketTokenClaims;
}

export class ProctoringSocketTokenService {
  private readonly participationRepository: ParticipationRepositoryLike;
  private readonly sessionRepository: SessionRepositoryLike;
  private readonly redisService: RedisServiceLike;
  private readonly nowFactory: () => Date;
  private readonly randomIdFactory: () => string;
  private readonly ttlSeconds: number;

  constructor(deps: ProctoringSocketTokenServiceDependencies = {}) {
    this.participationRepository = deps.participationRepository ?? new ExamParticipationRepository();
    this.sessionRepository = deps.sessionRepository ?? new ProctoringSessionRepository();
    this.redisService = deps.redisService ?? createProctoringRedisService();
    this.nowFactory = deps.nowFactory ?? (() => new Date());
    this.randomIdFactory = deps.randomIdFactory ?? (() => crypto.randomUUID());
    this.ttlSeconds = deps.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  async issueToken(input: IssueProctoringSocketTokenInput): Promise<ProctoringSocketTokenResponse> {
    if (!input.userId) {
      throw new AuthenticationException('Authentication is required to issue a proctoring socket token');
    }

    const participation = await this.participationRepository.findById(input.participationId);
    if (!participation) {
      throw new AppException('Exam participation not found', 404, 'PROCTORING_PARTICIPATION_NOT_FOUND');
    }
    if (participation.userId !== input.userId) {
      throw new AuthorizationException('Participation is not owned by the authenticated user');
    }

    const session = await this.sessionRepository.findActiveByParticipationAndClientSession({
      participationId: input.participationId,
      clientSessionId: input.clientSessionId,
    });
    const now = this.nowFactory();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    const claims: ProctoringSocketTokenClaims = {
      sub: input.userId,
      userId: input.userId,
      examId: participation.examId,
      participationId: participation.id,
      clientSessionId: input.clientSessionId,
      proctoringSessionId: session?.id,
      entrySessionId: session?.entrySessionId ?? null,
      purpose: PURPOSE,
      jti: this.randomIdFactory(),
      iat: unixSeconds(now),
      exp: unixSeconds(expiresAt),
    };

    const token = jwt.sign(claims, getSocketTokenSecret());

    return {
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifyTokenForHello(input: VerifyProctoringSocketTokenInput): Promise<ProctoringSocketTokenClaims> {
    let claims: ProctoringSocketTokenClaims;
    try {
      claims = decodeVerifiedClaims(input.token);
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException('Invalid proctoring socket token', 401, 'INVALID_PROCTORING_SOCKET_TOKEN');
    }

    if (claims.participationId !== input.participationId) {
      throw new AppException('Proctoring socket token participation mismatch', 403, 'PROCTORING_SOCKET_TOKEN_MISMATCH');
    }
    if (claims.clientSessionId !== input.clientSessionId) {
      throw new AppException('Proctoring socket token client session mismatch', 403, 'PROCTORING_SOCKET_TOKEN_MISMATCH');
    }
    if (input.userId && claims.sub !== input.userId) {
      throw new AppException('Proctoring socket token subject mismatch', 403, 'PROCTORING_SOCKET_TOKEN_MISMATCH');
    }

    const participation = await this.participationRepository.findById(claims.participationId);
    if (!participation || participation.userId !== claims.sub || participation.userId !== claims.userId) {
      throw new AuthorizationException('Participation is not owned by the proctoring socket token subject');
    }

    const now = this.nowFactory();
    const exp = typeof claims.exp === 'number' ? claims.exp : 0;
    const ttlSeconds = Math.max(1, exp - unixSeconds(now));
    const consumed = await this.redisService.consumeSocketTokenJti(claims.jti, ttlSeconds);
    if (!consumed) {
      throw new AppException('Proctoring socket token has already been used', 401, 'PROCTORING_SOCKET_TOKEN_REPLAYED');
    }

    return claims;
  }
}

export function createProctoringSocketTokenService(): ProctoringSocketTokenService {
  return new ProctoringSocketTokenService();
}
