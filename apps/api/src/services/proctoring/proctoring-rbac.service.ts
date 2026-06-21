import { AppException } from '@backend/api/exceptions/base.exception';

const PROCTORING_PERMISSIONS = {
  REVIEW_VIEW: 'proctoring.review.view',
  REVIEW_EXPORT: 'proctoring.review.export',
  REVIEW_DECIDE: 'proctoring.review.decide',
  REVIEW_LABEL: 'proctoring.review.label',
  RECOMPUTE_DETERMINISTIC: 'proctoring.recompute.deterministic',
  RECOMPUTE_AI: 'proctoring.recompute.ai',
  LLM_GENERATE: 'proctoring.llm.generate',
  LLM_REGENERATE: 'proctoring.llm.regenerate',
  SETTINGS_UPDATE: 'proctoring.settings.update',
  BYPASS_MANAGE: 'proctoring.bypass.manage',
  DATA_REQUEST_CREATE: 'proctoring.data_request.create',
  DATA_REQUEST_VALIDATE: 'proctoring.data_request.validate',
  DATA_REQUEST_EXECUTE: 'proctoring.data_request.execute',
  RETENTION_MANAGE: 'proctoring.retention.manage',
  AUDIT_VIEW: 'proctoring.audit.view',
} as const;

export type ProctoringPermission = (typeof PROCTORING_PERMISSIONS)[keyof typeof PROCTORING_PERMISSIONS];

type Actor = {
  userId?: string | null;
  role?: string | null;
};

function isAdmin(actor: Actor): boolean {
  return actor.role === 'owner' || actor.role === 'admin';
}

function assertAuthenticated(actor: Actor): void {
  if (!actor.userId) {
    throw new AppException(
      'Authentication required for proctoring operation.',
      401,
      'PROCTORING_RBAC_UNAUTHENTICATED'
    );
  }
}

function assertRole(actor: Actor): void {
  if (!isAdmin(actor)) {
    throw new AppException(
      'Insufficient permissions for proctoring operation.',
      403,
      'PROCTORING_RBAC_FORBIDDEN'
    );
  }
}

export class ProctoringRbacService {
  assertPermission(actor: Actor, permission: ProctoringPermission): void {
    assertAuthenticated(actor);
    assertRole(actor);
  }

  assertReviewView(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.REVIEW_VIEW);
  }

  assertReviewExport(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.REVIEW_EXPORT);
  }

  assertReviewDecide(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.REVIEW_DECIDE);
  }

  assertReviewLabel(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.REVIEW_LABEL);
  }

  assertRecomputeDeterministic(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.RECOMPUTE_DETERMINISTIC);
  }

  assertRecomputeAi(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.RECOMPUTE_AI);
  }

  assertLlmGenerate(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.LLM_GENERATE);
  }

  assertLlmRegenerate(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.LLM_REGENERATE);
  }

  assertSettingsUpdate(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.SETTINGS_UPDATE);
  }

  assertBypassManage(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.BYPASS_MANAGE);
  }

  assertDataRequestCreate(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.DATA_REQUEST_CREATE);
  }

  assertDataRequestValidate(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.DATA_REQUEST_VALIDATE);
  }

  assertDataRequestExecute(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.DATA_REQUEST_EXECUTE);
  }

  assertRetentionManage(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.RETENTION_MANAGE);
  }

  assertAuditView(actor: Actor): void {
    this.assertPermission(actor, PROCTORING_PERMISSIONS.AUDIT_VIEW);
  }
}

export function createProctoringRbacService(): ProctoringRbacService {
  return new ProctoringRbacService();
}
