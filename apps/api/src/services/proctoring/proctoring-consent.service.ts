import { AppException } from '@backend/api/exceptions/base.exception';
import {
  createExamRepository,
  ExamRepository,
} from '@backend/api/repositories/exam.repository';
import { ProctoringConsentRepository } from '@backend/api/repositories/proctoring/proctoringConsent.repository';
import { ProctoringSettingsRepository } from '@backend/api/repositories/proctoring/proctoringSettings.repository';
import { ExamProctoringConsentEntity } from '@backend/shared/db/schema';
import { CreateProctoringConsentInput } from '@backend/shared/validations/proctoring.validation';

import { buildDefaultProctoringSettings } from './proctoring-settings.service';

type ProctoringConsentServiceDependencies = {
  consentRepository: Pick<
    ProctoringConsentRepository,
    'insert' | 'findByParticipation' | 'withdraw' | 'findLatestAcceptedForCandidate'
  >;
  settingsRepository: Pick<ProctoringSettingsRepository, 'findByExamId'>;
  examRepository: Pick<ExamRepository, 'findBySlug'>;
};

type ConsentInputWithClock = CreateProctoringConsentInput & {
  now?: Date;
};

export class ProctoringConsentService {
  constructor(private readonly deps: ProctoringConsentServiceDependencies) {}

  async acceptConsent(
    slug: string,
    candidateUserId: string | undefined,
    input: ConsentInputWithClock,
  ): Promise<ExamProctoringConsentEntity> {
    if (!candidateUserId) {
      throw new AppException('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }
    if (input.accepted !== true) {
      throw new AppException('Consent must be explicitly accepted', 400, 'PROCTORING_CONSENT_REQUIRED');
    }

    const exam = await this.deps.examRepository.findBySlug(slug);
    if (!exam) {
      throw new AppException('Exam not found', 404, 'EXAM_NOT_FOUND');
    }

    const settings =
      (await this.deps.settingsRepository.findByExamId(exam.id)) ??
      buildDefaultProctoringSettings(exam.id);
    const acceptedAt = input.now ?? new Date();

    return this.deps.consentRepository.insert({
      examId: exam.id,
      entrySessionId: input.entrySessionId ?? null,
      participationId: input.participationId ?? null,
      candidateUserId,
      clientSessionId: input.clientSessionId,
      status: 'accepted',
      noticeVersion: settings.consentNoticeVersion,
      noticeSnapshotJson: {
        enabled: settings.enabled,
        requireCamera: settings.requireCamera,
        requireScreenShare: settings.requireScreenShare,
        requireFullscreen: settings.requireFullscreen,
        requireMonitorDisplaySurface: settings.requireMonitorDisplaySurface,
        consentNoticeVersion: settings.consentNoticeVersion,
      },
      acceptedCapabilitiesJson: input.acceptedCapabilitiesJson ?? {},
      legalLinksSnapshotJson: settings.legalLinksJson ?? {},
      dataRetentionDaysSnapshot: settings.dataRetentionDays,
      dataDeletionSlaDaysSnapshot: settings.dataDeletionSlaDays,
      sensitiveDataDeletionTargetHoursSnapshot: settings.sensitiveDataDeletionTargetHours,
      acceptedAt,
    } as any);
  }

  async withdrawConsent(
    participationId: string,
    candidateUserId: string | undefined,
  ): Promise<ExamProctoringConsentEntity> {
    if (!candidateUserId) {
      throw new AppException('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const consents = await this.deps.consentRepository.findByParticipation(participationId);
    const activeConsent = consents.find(
      consent =>
        consent.status === 'accepted' &&
        (!('candidateUserId' in consent) || consent.candidateUserId === candidateUserId),
    );
    if (!activeConsent) {
      throw new AppException('Accepted consent not found', 404, 'PROCTORING_CONSENT_NOT_FOUND');
    }

    const withdrawn = await this.deps.consentRepository.withdraw(activeConsent.id, new Date());
    if (!withdrawn) {
      throw new AppException('Failed to withdraw consent', 409, 'PROCTORING_CONSENT_WITHDRAW_FAILED');
    }

    return withdrawn;
  }
}

export function createProctoringConsentService(): ProctoringConsentService {
  return new ProctoringConsentService({
    consentRepository: new ProctoringConsentRepository(),
    settingsRepository: new ProctoringSettingsRepository(),
    examRepository: createExamRepository(),
  });
}
