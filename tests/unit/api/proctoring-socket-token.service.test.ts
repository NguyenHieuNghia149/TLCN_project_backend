import jwt from 'jsonwebtoken';

describe('ProctoringSocketTokenService', () => {
  const originalEnv = process.env;
  const participation = {
    id: '22222222-2222-2222-2222-222222222222',
    examId: '11111111-1111-1111-1111-111111111111',
    userId: 'candidate-1',
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      PROCTORING_SOCKET_TOKEN_SECRET: 'socket-token-secret-for-tests',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('issues a short-lived signed token bound to the authenticated owner and client session', async () => {
    const { ProctoringSocketTokenService } = require('../../../apps/api/src/services/proctoring/proctoring-socket-token.service');
    const service = new ProctoringSocketTokenService({
      participationRepository: {
        findById: jest.fn().mockResolvedValue(participation),
      },
      sessionRepository: {
        findActiveByParticipationAndClientSession: jest.fn().mockResolvedValue({
          id: '33333333-3333-3333-3333-333333333333',
        }),
      },
      nowFactory: () => new Date('2026-06-13T00:00:00.000Z'),
      randomIdFactory: () => 'token-jti-1',
    });

    const result = await service.issueToken({
      participationId: participation.id,
      userId: participation.userId,
      clientSessionId: 'client-1',
    });

    expect(result).toEqual({
      token: expect.any(String),
      expiresAt: '2026-06-13T00:02:00.000Z',
    });

    const claims = jwt.verify(
      result.token,
      'socket-token-secret-for-tests',
      { ignoreExpiration: true },
    ) as jwt.JwtPayload & Record<string, unknown>;
    expect(claims).toMatchObject({
      sub: participation.userId,
      userId: participation.userId,
      examId: participation.examId,
      participationId: participation.id,
      clientSessionId: 'client-1',
      proctoringSessionId: '33333333-3333-3333-3333-333333333333',
      purpose: 'proctoring_socket',
      jti: 'token-jti-1',
      iat: Math.floor(new Date('2026-06-13T00:00:00.000Z').getTime() / 1000),
    });
    expect(claims.exp).toBe(Math.floor(new Date('2026-06-13T00:02:00.000Z').getTime() / 1000));
  });

  it('rejects token issuance without an authenticated user', async () => {
    const { ProctoringSocketTokenService } = require('../../../apps/api/src/services/proctoring/proctoring-socket-token.service');
    const service = new ProctoringSocketTokenService({
      participationRepository: {
        findById: jest.fn(),
      },
    });

    await expect(
      service.issueToken({
        participationId: participation.id,
        userId: undefined,
        clientSessionId: 'client-1',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('rejects token issuance for a participation owned by another user', async () => {
    const { ProctoringSocketTokenService } = require('../../../apps/api/src/services/proctoring/proctoring-socket-token.service');
    const service = new ProctoringSocketTokenService({
      participationRepository: {
        findById: jest.fn().mockResolvedValue(participation),
      },
    });

    await expect(
      service.issueToken({
        participationId: participation.id,
        userId: 'other-user',
        clientSessionId: 'client-1',
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('verifies token claims and consumes the jti once through Redis', async () => {
    const { ProctoringSocketTokenService } = require('../../../apps/api/src/services/proctoring/proctoring-socket-token.service');
    const redisService = {
      consumeSocketTokenJti: jest.fn().mockResolvedValue(true),
    };
    const service = new ProctoringSocketTokenService({
      participationRepository: {
        findById: jest.fn().mockResolvedValue(participation),
      },
      redisService,
      nowFactory: () => new Date(),
    });
    const exp = Math.floor(Date.now() / 1000) + 120;
    const token = jwt.sign(
      {
        sub: participation.userId,
        userId: participation.userId,
        examId: participation.examId,
        participationId: participation.id,
        clientSessionId: 'client-1',
        purpose: 'proctoring_socket',
        jti: 'token-jti-1',
        exp,
      },
      'socket-token-secret-for-tests',
    );

    const claims = await service.verifyTokenForHello({
      token,
      participationId: participation.id,
      clientSessionId: 'client-1',
      userId: participation.userId,
    });

    expect(claims.jti).toBe('token-jti-1');
    expect(redisService.consumeSocketTokenJti).toHaveBeenCalledWith('token-jti-1', expect.any(Number));
  });

  it('rejects expired tokens', async () => {
    const { ProctoringSocketTokenService } = require('../../../apps/api/src/services/proctoring/proctoring-socket-token.service');
    const service = new ProctoringSocketTokenService({
      participationRepository: {
        findById: jest.fn(),
      },
      redisService: {
        consumeSocketTokenJti: jest.fn(),
      },
    });
    const token = jwt.sign(
      {
        sub: participation.userId,
        userId: participation.userId,
        examId: participation.examId,
        participationId: participation.id,
        clientSessionId: 'client-1',
        purpose: 'proctoring_socket',
        jti: 'expired-jti',
        exp: 1,
      },
      'socket-token-secret-for-tests',
    );

    await expect(
      service.verifyTokenForHello({
        token,
        participationId: participation.id,
        clientSessionId: 'client-1',
        userId: participation.userId,
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('rejects mismatched participation, client session, user, and replayed jti', async () => {
    const { ProctoringSocketTokenService } = require('../../../apps/api/src/services/proctoring/proctoring-socket-token.service');
    const token = jwt.sign(
      {
        sub: participation.userId,
        userId: participation.userId,
        examId: participation.examId,
        participationId: participation.id,
        clientSessionId: 'client-1',
        purpose: 'proctoring_socket',
        jti: 'token-jti-1',
        exp: Math.floor(Date.now() / 1000) + 120,
      },
      'socket-token-secret-for-tests',
    );

    const baseDeps = {
      participationRepository: {
        findById: jest.fn().mockResolvedValue(participation),
      },
      redisService: {
        consumeSocketTokenJti: jest.fn().mockResolvedValue(true),
      },
    };

    await expect(
      new ProctoringSocketTokenService(baseDeps).verifyTokenForHello({
        token,
        participationId: '99999999-9999-9999-9999-999999999999',
        clientSessionId: 'client-1',
        userId: participation.userId,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      new ProctoringSocketTokenService(baseDeps).verifyTokenForHello({
        token,
        participationId: participation.id,
        clientSessionId: 'client-2',
        userId: participation.userId,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      new ProctoringSocketTokenService(baseDeps).verifyTokenForHello({
        token,
        participationId: participation.id,
        clientSessionId: 'client-1',
        userId: 'other-user',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      new ProctoringSocketTokenService({
        participationRepository: {
          findById: jest.fn().mockResolvedValue(participation),
        },
        redisService: {
          consumeSocketTokenJti: jest.fn().mockResolvedValue(false),
        },
      }).verifyTokenForHello({
        token,
        participationId: participation.id,
        clientSessionId: 'client-1',
        userId: participation.userId,
      }),
    ).rejects.toMatchObject({ code: 'PROCTORING_SOCKET_TOKEN_REPLAYED' });
  });
});
