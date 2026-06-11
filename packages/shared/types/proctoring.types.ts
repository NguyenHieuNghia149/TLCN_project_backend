export type ProctoringConsentStatus = 'accepted' | 'withdrawn' | 'superseded';

export type ProctoringPrecheckDisplaySurface =
  | 'monitor'
  | 'window'
  | 'browser'
  | 'surface_unknown';

export type ProctoringBypassStatus = 'issued' | 'used' | 'revoked' | 'expired';

export type ProctoringDataRequestType =
  | 'withdraw_consent'
  | 'delete'
  | 'restrict'
  | 'anonymize';

export type ProctoringDataRequestStatus =
  | 'requested'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'blocked_by_retention'
  | 'failed';

export type ProctoringSettingsDto = {
  examId: string;
  enabled: boolean;
  requireCamera: boolean;
  requireScreenShare: boolean;
  requireFullscreen: boolean;
  requireMonitorDisplaySurface: boolean;
  precheckValiditySeconds: number;
  heartbeatIntervalSeconds: number;
  missedHeartbeatGraceMultiplier: number;
  screenShareResumeTimeoutSeconds: number;
  fullscreenResumeTimeoutSeconds: number;
  allowedEventTypesJson: string[];
  riskWeightsJson: Record<string, number>;
  riskThresholdsJson: Record<string, number>;
  clipboardPolicy: string;
  aiAnomalyEnabled: boolean;
  aiShadowMode: boolean;
  aiJobWindowSeconds: number;
  consentNoticeVersion: string;
  legalLinksJson: Record<string, string>;
  dataRetentionDays: number;
  dataDeletionSlaDays: number;
  sensitiveDataDeletionTargetHours: number;
};

export type ProctoringBypassGrantDto = {
  bypassCodeId: string;
  status: ProctoringBypassStatus;
  expiresAt?: string;
};
