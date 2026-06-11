import { AppException } from '@backend/api/exceptions/base.exception';
import { ProctoringBypassRepository } from '@backend/api/repositories/proctoring/proctoringBypass.repository';
import { ProctoringConsentRepository } from '@backend/api/repositories/proctoring/proctoringConsent.repository';
import { ProctoringPrecheckRepository } from '@backend/api/repositories/proctoring/proctoringPrecheck.repository';
import { ProctoringSessionRepository } from '@backend/api/repositories/proctoring/proctoringSession.repository';
import { ProctoringSettingsRepository } from '@backend/api/repositories/proctoring/proctoringSettings.repository';

import { buildDefaultProctoringSettings } from './proctoring-settings.service';

export type ProctoringStartInput = {
  clientSessionId?: string;
  consentRecordId?: string;
  precheckId?: string;
  bypassCode?: string;
  bypassCodeId?: string;
};

export type ProctoringStartGateResult = {
  proctoringRequired: boolean;
  examId: string;
  participantId: string;
  userId: string;
  clientSessionId?: string;
  consentRecordId?: string;
  precheckId?: string | null;
  bypassCodeId?: string | null;
};

type ProctoringStartGateServiceDependencies = {
  settingsRepository: Pick<ProctoringSettingsRepository, 'findByExamId'>;
  consentRepository: Pick<ProctoringConsentRepository, 'findById'>;
  precheckRepository: Pick<ProctoringPrecheckRepository, 'findById' | 'findValidPassedById'>;
  bypassRepository: Pick<ProctoringBypassRepository, 'findUsedGrant'>;
  sessionRepository: Pick<ProctoringSessionRepository, 'insert'>;
};

export class ProctoringStartGateService {
  constructor(private readonly deps: ProctoringStartGateServiceDependencies) {}

  async validateStartRequest(input: {
    exam: any;
    entrySession: any;
    participant: any;
    userId: string;
    proctoring?: ProctoringStartInput;
  }): Promise<ProctoringStartGateResult> {
    const settings =
      (await this.deps.settingsRepository.findByExamId(input.exam.id)) ??
      buildDefaultProctoringSettings(input.exam.id);

    if (!settings.enabled) {
      return {
        proctoringRequired: false,
        examId: input.exam.id,
        participantId: input.participant.id,
        userId: input.userId,
      };
    }

    const proctoring = input.proctoring ?? {};
    if (!proctoring.clientSessionId) {
      throw new AppException(
        'Proctoring client session is required',
        403,
        'PROCTORING_CLIENT_SESSION_REQUIRED',
      );
    }
    if (!proctoring.consentRecordId) {
      throw new AppException(
        'Accepted consent is required',
        403,
        'PROCTORING_CONSENT_REQUIRED',
      );
    }

    const consent = await this.deps.consentRepository.findById(proctoring.consentRecordId);
    if (
      !consent ||
      consent.status !== 'accepted' ||
      consent.examId !== input.exam.id ||
      consent.candidateUserId !== input.userId ||
      consent.clientSessionId !== proctoring.clientSessionId
    ) {
      throw new AppException(
        'Accepted consent is required',
        403,
        'PROCTORING_CONSENT_REQUIRED',
      );
    }

    if (proctoring.bypassCodeId) {
      const grant = await this.deps.bypassRepository.findUsedGrant({
        id: proctoring.bypassCodeId,
        examId: input.exam.id,
        candidateUserId: input.userId,
        entrySessionId: input.entrySession.id,
      });
      if (!grant) {
        throw new AppException(
          'Valid proctoring bypass is required',
          403,
          'PROCTORING_BYPASS_REQUIRED',
        );
      }

      return {
        proctoringRequired: true,
        examId: input.exam.id,
        participantId: input.participant.id,
        userId: input.userId,
        clientSessionId: proctoring.clientSessionId,
        consentRecordId: consent.id,
        precheckId: proctoring.precheckId ?? null,
        bypassCodeId: grant.id,
      };
    }

    if (!proctoring.precheckId) {
      throw new AppException(
        'Valid precheck is required',
        409,
        'PROCTORING_PRECHECK_REQUIRED',
      );
    }

    const validPrecheck = await this.deps.precheckRepository.findValidPassedById(
      proctoring.precheckId,
    );
    if (!validPrecheck) {
      throw new AppException('Precheck expired', 409, 'PROCTORING_PRECHECK_EXPIRED');
    }

    if (
      validPrecheck.examId !== input.exam.id ||
      validPrecheck.candidateUserId !== input.userId ||
      validPrecheck.clientSessionId !== proctoring.clientSessionId ||
      validPrecheck.consentRecordId !== consent.id
    ) {
      throw new AppException('Precheck expired', 409, 'PROCTORING_PRECHECK_EXPIRED');
    }

    return {
      proctoringRequired: true,
      examId: input.exam.id,
      participantId: input.participant.id,
      userId: input.userId,
      clientSessionId: proctoring.clientSessionId,
      consentRecordId: consent.id,
      precheckId: validPrecheck.id,
      bypassCodeId: null,
    };
  }

  async createSessionRecord(input: ProctoringStartGateResult & {
    participationId: string;
    entrySessionId: string;
    startedAt: Date;
  }): Promise<unknown> {
    if (!input.proctoringRequired || !input.clientSessionId || !input.consentRecordId) {
      return null;
    }

    return this.deps.sessionRepository.insert({
      examId: input.examId,
      entrySessionId: input.entrySessionId,
      participationId: input.participationId,
      candidateUserId: input.userId,
      clientSessionId: input.clientSessionId,
      consentRecordId: input.consentRecordId,
      precheckId: input.precheckId ?? null,
      bypassCodeId: input.bypassCodeId ?? null,
      status: 'active',
      startedAt: input.startedAt,
      lastSeenAt: input.startedAt,
      lastAcceptedClientSeq: 0,
      lastPersistedClientSeq: 0,
    } as any);
  }
}

export function createProctoringStartGateService(): ProctoringStartGateService {
  return new ProctoringStartGateService({
    settingsRepository: new ProctoringSettingsRepository(),
    consentRepository: new ProctoringConsentRepository(),
    precheckRepository: new ProctoringPrecheckRepository(),
    bypassRepository: new ProctoringBypassRepository(),
    sessionRepository: new ProctoringSessionRepository(),
  });
}
