import { createHash, randomBytes } from 'node:crypto';

import { AppException } from '@backend/api/exceptions/base.exception';
import {
  createExamRepository,
  ExamRepository,
} from '@backend/api/repositories/exam.repository';
import { ProctoringBypassRepository } from '@backend/api/repositories/proctoring/proctoringBypass.repository';
import { ExamProctoringBypassCodeEntity } from '@backend/shared/db/schema';
import {
  IssueProctoringBypassCodeInput,
  VerifyProctoringBypassInput,
} from '@backend/shared/validations/proctoring.validation';

type BypassBinding = {
  examId: string;
  participationId?: string | null;
  entrySessionId?: string | null;
  clientSessionId: string;
};

type ProctoringBypassServiceDependencies = {
  bypassRepository: Pick<
    ProctoringBypassRepository,
    'insert' | 'findIssuedForVerification' | 'findUsedGrant' | 'markUsed' | 'incrementFailedAttempts'
  >;
  examRepository?: Pick<ExamRepository, 'findBySlug'>;
  generateCode?: () => string;
  hashCode?: (code: string, binding: BypassBinding) => string;
};

type IssueBypassInputWithClock = IssueProctoringBypassCodeInput & {
  participationId?: string;
  now?: Date;
};

function defaultGenerateCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function defaultHashCode(code: string, binding: BypassBinding): string {
  return createHash('sha256')
    .update(
      [
        code.trim(),
        binding.examId,
        binding.participationId ?? '',
        binding.entrySessionId ?? '',
        binding.clientSessionId,
      ].join('|'),
    )
    .digest('hex');
}

function asIso(value: unknown): string | undefined {
  return value instanceof Date ? value.toISOString() : value ? new Date(value as any).toISOString() : undefined;
}

export class ProctoringBypassService {
  private readonly generateCode: () => string;
  private readonly hashCode: (code: string, binding: BypassBinding) => string;

  constructor(private readonly deps: ProctoringBypassServiceDependencies) {
    this.generateCode = deps.generateCode ?? defaultGenerateCode;
    this.hashCode = deps.hashCode ?? defaultHashCode;
  }

  async issueBypassCode(
    examId: string,
    issuedByUserId: string | undefined,
    input: IssueBypassInputWithClock,
  ): Promise<{ bypassCodeId: string; code: string; status: string; expiresAt?: string }> {
    if (!issuedByUserId) {
      throw new AppException('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const now = input.now ?? new Date();
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt)
      : new Date(now.getTime() + 15 * 60 * 1000);
    const code = this.generateCode();
    const binding: BypassBinding = {
      examId,
      participationId: input.participationId ?? null,
      entrySessionId: input.entrySessionId ?? null,
      clientSessionId: input.clientSessionId,
    };

    const created = await this.deps.bypassRepository.insert({
      examId,
      entrySessionId: input.entrySessionId ?? null,
      participationId: input.participationId ?? null,
      clientSessionId: input.clientSessionId,
      codeHash: this.hashCode(code, binding),
      status: 'issued',
      reason: input.reason,
      issuedByUserId,
      expiresAt,
    } as any);

    return {
      bypassCodeId: created.id,
      code,
      status: created.status,
      expiresAt: asIso(created.expiresAt),
    };
  }

  async verifyBypassCode(
    examSlugOrId: string,
    candidateUserId: string | undefined,
    input: VerifyProctoringBypassInput,
  ): Promise<{ bypassCodeId: string; status: string; expiresAt?: string }> {
    if (!candidateUserId) {
      throw new AppException('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const examId = await this.resolveExamId(examSlugOrId);
    const binding: BypassBinding = {
      examId,
      participationId: input.participationId ?? null,
      entrySessionId: input.entrySessionId ?? null,
      clientSessionId: input.clientSessionId,
    };
    const bypass = await this.deps.bypassRepository.findIssuedForVerification({
      ...binding,
      now: new Date(),
    });
    if (!bypass) {
      throw new AppException('Bypass code not found', 404, 'PROCTORING_BYPASS_NOT_FOUND');
    }

    const expectedHash = this.hashCode(input.bypassCode, binding);
    if (bypass.codeHash !== expectedHash) {
      await this.deps.bypassRepository.incrementFailedAttempts(bypass.id);
      throw new AppException('Invalid bypass code', 403, 'PROCTORING_BYPASS_INVALID');
    }

    const used = await this.deps.bypassRepository.markUsed(bypass.id, {
      usedByUserId: candidateUserId,
      usedAt: new Date(),
    });
    if (!used) {
      throw new AppException('Bypass code could not be used', 409, 'PROCTORING_BYPASS_USE_FAILED');
    }

    return this.toGrant(used);
  }

  async findReusableGrant(input: {
    bypassCodeId: string;
    examId: string;
    candidateUserId: string;
    entrySessionId?: string | null;
    participationId?: string | null;
  }): Promise<ExamProctoringBypassCodeEntity | null> {
    return this.deps.bypassRepository.findUsedGrant({
      id: input.bypassCodeId,
      examId: input.examId,
      candidateUserId: input.candidateUserId,
      entrySessionId: input.entrySessionId ?? null,
      participationId: input.participationId ?? null,
      now: new Date(),
    });
  }

  private async resolveExamId(examSlugOrId: string): Promise<string> {
    if (!this.deps.examRepository || /^[0-9a-f-]{36}$/i.test(examSlugOrId)) {
      return examSlugOrId;
    }

    const exam = await this.deps.examRepository.findBySlug(examSlugOrId);
    if (!exam) {
      throw new AppException('Exam not found', 404, 'EXAM_NOT_FOUND');
    }
    return exam.id;
  }

  private toGrant(row: ExamProctoringBypassCodeEntity): {
    bypassCodeId: string;
    status: string;
    expiresAt?: string;
  } {
    return {
      bypassCodeId: row.id,
      status: row.status,
      expiresAt: asIso(row.expiresAt),
    };
  }
}

export function createProctoringBypassService(): ProctoringBypassService {
  return new ProctoringBypassService({
    bypassRepository: new ProctoringBypassRepository(),
    examRepository: createExamRepository(),
  });
}
