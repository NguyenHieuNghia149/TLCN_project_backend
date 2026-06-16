import { AppException } from '@backend/api/exceptions/base.exception';
import { ProctoringConsentRepository } from '@backend/api/repositories/proctoring/proctoringConsent.repository';
import { ProctoringPrecheckRepository } from '@backend/api/repositories/proctoring/proctoringPrecheck.repository';
import { ProctoringSettingsRepository } from '@backend/api/repositories/proctoring/proctoringSettings.repository';
import { ExamProctoringPrecheckEntity } from '@backend/shared/db/schema';
import { CreateProctoringPrecheckInput } from '@backend/shared/validations/proctoring.validation';

import { buildDefaultProctoringSettings } from './proctoring-settings.service';

type ProctoringPrecheckServiceDependencies = {
  precheckRepository: Pick<ProctoringPrecheckRepository, 'insert' | 'findById' | 'findValidPassedById' | 'findByParticipation'>;
  consentRepository: Pick<ProctoringConsentRepository, 'findById'>;
  settingsRepository: Pick<ProctoringSettingsRepository, 'findByExamId'>;
};

type PrecheckInputWithClock = CreateProctoringPrecheckInput & {
  now?: Date;
};

function addFailure(reasons: string[], enabled: boolean, code: string): void {
  if (!enabled) {
    reasons.push(code);
  }
}

export class ProctoringPrecheckService {
  constructor(private readonly deps: ProctoringPrecheckServiceDependencies) {}

  async createPrecheck(
    _slug: string,
    candidateUserId: string | undefined,
    input: PrecheckInputWithClock,
  ): Promise<ExamProctoringPrecheckEntity> {
    if (!candidateUserId) {
      throw new AppException('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const consent = await this.deps.consentRepository.findById(input.consentRecordId);
    if (!consent || consent.status !== 'accepted') {
      throw new AppException('Accepted consent not found', 404, 'PROCTORING_CONSENT_NOT_FOUND');
    }
    if (consent.candidateUserId !== candidateUserId) {
      throw new AppException('Consent belongs to another candidate', 403, 'PROCTORING_CONSENT_FORBIDDEN');
    }
    if (consent.clientSessionId !== input.clientSessionId) {
      throw new AppException('Consent client session mismatch', 409, 'PROCTORING_CLIENT_SESSION_MISMATCH');
    }

    const defaultSettings = buildDefaultProctoringSettings(consent.examId);
    const settings =
      (await this.deps.settingsRepository.findByExamId(consent.examId)) ??
      defaultSettings;
    const now = input.now ?? new Date();
    const failureReasons: string[] = [];

    addFailure(failureReasons, input.browserSupported, 'browser_unsupported');
    addFailure(failureReasons, input.getUserMediaSupported, 'get_user_media_unsupported');
    addFailure(failureReasons, input.cameraPermissionGranted, 'camera_permission_denied');
    if (settings.requireScreenShare) {
      addFailure(failureReasons, input.getDisplayMediaSupported, 'get_display_media_unsupported');
    }
    addFailure(failureReasons, input.fullscreenSupported, 'fullscreen_unsupported');

    if (settings.requireFullscreen && !input.fullscreenActive) {
      failureReasons.push('fullscreen_required');
    }

    const monitorValidated =
      input.monitorValidated === true || input.displaySurface === 'monitor';
    if (settings.requireScreenShare && settings.requireMonitorDisplaySurface && !monitorValidated) {
      failureReasons.push(
        input.displaySurface === 'surface_unknown'
          ? 'display_surface_unknown'
          : 'monitor_display_surface_required',
      );
    }

    const precheckValiditySeconds =
      settings.precheckValiditySeconds ?? defaultSettings.precheckValiditySeconds ?? 300;
    const expiresAt = new Date(now.getTime() + precheckValiditySeconds * 1000);

    return this.deps.precheckRepository.insert({
      examId: consent.examId,
      entrySessionId: consent.entrySessionId ?? null,
      participationId: consent.participationId ?? null,
      candidateUserId,
      clientSessionId: input.clientSessionId,
      consentRecordId: consent.id,
      browserName: input.browserName ?? null,
      browserVersion: input.browserVersion ?? null,
      osName: input.osName ?? null,
      getUserMediaSupported: input.getUserMediaSupported,
      cameraPermissionGranted: input.cameraPermissionGranted,
      getDisplayMediaSupported: input.getDisplayMediaSupported,
      displaySurface: input.displaySurface ?? null,
      monitorValidated,
      fullscreenSupported: input.fullscreenSupported,
      browserSupported: input.browserSupported,
      passed: failureReasons.length === 0,
      failureReasonsJson: failureReasons,
      expiresAt,
    } as any);
  }
}

export function createProctoringPrecheckService(): ProctoringPrecheckService {
  return new ProctoringPrecheckService({
    precheckRepository: new ProctoringPrecheckRepository(),
    consentRepository: new ProctoringConsentRepository(),
    settingsRepository: new ProctoringSettingsRepository(),
  });
}
