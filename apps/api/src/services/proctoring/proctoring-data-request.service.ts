import { AppException } from '@backend/api/exceptions/base.exception';
import { AdminAuditLogRepository } from '@backend/api/repositories/adminAuditLog.repository';
import { ProctoringDataRequestRepository } from '@backend/shared/db/repositories/proctoringDataRequest.repository';
import { db } from '@backend/shared/db/connection';
import { examParticipations } from '@backend/shared/db/schema';
import { eq } from 'drizzle-orm';

import {
  createProctoringRbacService,
  ProctoringRbacService,
} from './proctoring-rbac.service';

type Actor = {
  userId?: string | null;
  role?: string | null;
};

type Dependencies = {
  dataRequestRepository?: ProctoringDataRequestRepository;
  rbacService?: Pick<
    ProctoringRbacService,
    'assertDataRequestCreate' | 'assertDataRequestValidate' | 'assertDataRequestExecute'
  >;
  auditLogRepository?: Pick<AdminAuditLogRepository, 'create'>;
  nowFactory?: () => Date;
};

export class ProctoringDataRequestService {
  private readonly dataRequestRepository: ProctoringDataRequestRepository;
  private readonly rbacService: Pick<
    ProctoringRbacService,
    'assertDataRequestCreate' | 'assertDataRequestValidate' | 'assertDataRequestExecute'
  >;
  private readonly auditLogRepository: Pick<AdminAuditLogRepository, 'create'>;
  private readonly nowFactory: () => Date;

  constructor(deps: Dependencies = {}) {
    this.dataRequestRepository =
      deps.dataRequestRepository ?? new ProctoringDataRequestRepository();
    this.rbacService = deps.rbacService ?? createProctoringRbacService();
    this.auditLogRepository = deps.auditLogRepository ?? new AdminAuditLogRepository();
    this.nowFactory = deps.nowFactory ?? (() => new Date());
  }

  async create(input: {
    examId: string;
    participationId: string;
    candidateUserId: string;
    requestType: string;
    actor: Actor;
  }) {
    this.rbacService.assertDataRequestCreate(input.actor);
    const now = this.nowFactory();
    const executionHours = 72;
    const dueAt = new Date(now.getTime() + executionHours * 60 * 60 * 1000);

    const request = await this.dataRequestRepository.insert({
      examId: input.examId,
      participationId: input.participationId,
      candidateUserId: input.candidateUserId,
      requesterUserId: input.actor.userId ?? null,
      requestType: input.requestType,
      status: 'requested',
      requestedAt: now,
      statutoryDueAt: dueAt,
      internalTargetDueAt: dueAt,
      executionTargetHours: executionHours,
      requestMetadataJson: { source: 'admin-panel', actorRole: input.actor.role },
    } as any);

    await this.auditLogRepository.create({
      actorType: input.actor.userId ? 'user' : 'system',
      actorId: input.actor.userId ?? null,
      action: 'proctoring_data_request_create',
      targetType: 'exam_proctoring_data_request',
      targetId: request.id,
      metadata: {
        examId: input.examId,
        requestType: input.requestType,
      },
    } as any);

    return request;
  }

  async validate(input: { requestId: string; actor: Actor }) {
    this.rbacService.assertDataRequestValidate(input.actor);

    const existing = await this.dataRequestRepository.findById(input.requestId);
    if (!existing) {
      throw new AppException(
        'Data request not found.',
        404,
        'PROCTORING_DATA_REQUEST_NOT_FOUND'
      );
    }
    if (existing.status !== 'requested') {
      throw new AppException(
        'Data request can only be validated from requested status.',
        400,
        'PROCTORING_DATA_REQUEST_INVALID_STATUS'
      );
    }

    const now = this.nowFactory();
    const result = await this.dataRequestRepository.updateStatus(input.requestId, {
      status: 'validated',
      approvedByUserId: input.actor.userId ?? null,
      approvedAt: now,
    });

    await this.auditLogRepository.create({
      actorType: input.actor.userId ? 'user' : 'system',
      actorId: input.actor.userId ?? null,
      action: 'proctoring_data_request_validate',
      targetType: 'exam_proctoring_data_request',
      targetId: input.requestId,
    } as any);

    return result;
  }

  async reject(input: { requestId: string; reason: string; actor: Actor }) {
    this.rbacService.assertDataRequestValidate(input.actor);

    const existing = await this.dataRequestRepository.findById(input.requestId);
    if (!existing) {
      throw new AppException(
        'Data request not found.',
        404,
        'PROCTORING_DATA_REQUEST_NOT_FOUND'
      );
    }
    if (existing.status !== 'requested') {
      throw new AppException(
        'Data request can only be rejected from requested status.',
        400,
        'PROCTORING_DATA_REQUEST_INVALID_STATUS'
      );
    }

    const now = this.nowFactory();
    const result = await this.dataRequestRepository.updateStatus(input.requestId, {
      status: 'rejected',
      rejectedAt: now,
      reasonCode: input.reason.slice(0, 80),
    });

    await this.auditLogRepository.create({
      actorType: input.actor.userId ? 'user' : 'system',
      actorId: input.actor.userId ?? null,
      action: 'proctoring_data_request_reject',
      targetType: 'exam_proctoring_data_request',
      targetId: input.requestId,
      metadata: { reasonCode: input.reason.slice(0, 40) },
    } as any);

    return result;
  }

  async execute(input: { requestId: string; dryRun: boolean; reason: string; actor: Actor }) {
    this.rbacService.assertDataRequestExecute(input.actor);

    const existing = await this.dataRequestRepository.findById(input.requestId);
    if (!existing) {
      throw new AppException(
        'Data request not found.',
        404,
        'PROCTORING_DATA_REQUEST_NOT_FOUND'
      );
    }
    if (existing.status !== 'validated') {
      throw new AppException(
        'Data request must be validated before execution.',
        400,
        'PROCTORING_DATA_REQUEST_INVALID_STATUS'
      );
    }
    if (!input.dryRun && process.env.NODE_ENV !== 'staging' && process.env.NODE_ENV !== 'test') {
      throw new AppException(
        'Mutating execution is only allowed in staging environment.',
        400,
        'PROCTORING_DATA_REQUEST_MUTATION_REFUSED'
      );
    }

    const now = this.nowFactory();
    const result = await this.dataRequestRepository.updateStatus(input.requestId, {
      lastExecutionDryRun: input.dryRun,
      lastExecutionRequestedAt: now,
      lastExecutionRequestedBy: input.actor.userId ?? null,
      dryRunMode: input.dryRun ? 'dry_run' : 'mutating',
    } as any);

    await this.auditLogRepository.create({
      actorType: input.actor.userId ? 'user' : 'system',
      actorId: input.actor.userId ?? null,
      action: input.dryRun
        ? 'proctoring_data_request_execute_dry_run'
        : 'proctoring_data_request_execute_mutating',
      targetType: 'exam_proctoring_data_request',
      targetId: input.requestId,
      metadata: { dryRun: input.dryRun, reason: input.reason },
    } as any);

    return result;
  }

  async createDataRequest(
    participationId: string,
    userId: string | undefined,
    body: Record<string, unknown>
  ) {
    if (!userId) {
      throw new AppException(
        'Authentication required.',
        401,
        'PROCTORING_DATA_REQUEST_UNAUTHENTICATED'
      );
    }

    const [participation] = await db
      .select({ examId: examParticipations.examId, userId: examParticipations.userId })
      .from(examParticipations)
      .where(eq(examParticipations.id, participationId));

    if (!participation) {
      throw new AppException(
        'Participation not found.',
        404,
        'PROCTORING_PARTICIPATION_NOT_FOUND'
      );
    }
    if (participation.userId !== userId) {
      throw new AppException(
        'Participation does not belong to the authenticated user.',
        403,
        'PROCTORING_DATA_REQUEST_OWNERSHIP_MISMATCH'
      );
    }

    const now = this.nowFactory();
    const executionHours = 72;
    const dueAt = new Date(now.getTime() + executionHours * 60 * 60 * 1000);
    const requestType = typeof body.requestType === 'string' ? body.requestType : 'delete';

    const request = await this.dataRequestRepository.insert({
      examId: participation.examId,
      participationId,
      candidateUserId: userId,
      requesterUserId: userId,
      requestType,
      status: 'requested',
      requestedAt: now,
      statutoryDueAt: dueAt,
      internalTargetDueAt: dueAt,
      executionTargetHours: executionHours,
      requestMetadataJson: { source: 'candidate' },
    } as any);

    await this.auditLogRepository.create({
      actorType: 'user',
      actorId: userId,
      action: 'data_request_created',
      targetType: 'exam_proctoring_data_request',
      targetId: request.id,
      metadata: {
        participationId,
        requestType,
      },
    } as any);

    return request;
  }

  async findByExamId(examId: string, actor: Actor) {
    this.rbacService.assertDataRequestCreate(actor);
    return this.dataRequestRepository.findByExamId(examId);
  }

  async findById(id: string, actor: Actor) {
    this.rbacService.assertDataRequestCreate(actor);
    return this.dataRequestRepository.findById(id);
  }
}

export function createProctoringDataRequestService(): ProctoringDataRequestService {
  return new ProctoringDataRequestService();
}
