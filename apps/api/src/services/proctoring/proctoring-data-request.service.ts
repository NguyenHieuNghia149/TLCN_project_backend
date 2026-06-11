import { eq } from 'drizzle-orm';

import { AppException } from '@backend/api/exceptions/base.exception';
import { ExamParticipationRepository } from '@backend/api/repositories/examParticipation.repository';
import { ProctoringDataRequestRepository } from '@backend/api/repositories/proctoring/proctoringDataRequest.repository';
import { db } from '@backend/shared/db/connection';
import {
  examProctoringBypassCodes,
  examProctoringConsents,
  examProctoringDataRequests,
  examProctoringEvents,
  examProctoringFinalFlushReceipts,
  examProctoringPrechecks,
  examProctoringSessions,
  examProctoringSummaries,
  proctoringAiJobs,
} from '@backend/shared/db/schema';
import { CreateProctoringDataRequestInput } from '@backend/shared/validations/proctoring.validation';

type ProctoringDataRequestServiceDependencies = {
  dataRequestRepository: Pick<
    ProctoringDataRequestRepository,
    'insert' | 'findById' | 'findByParticipation' | 'updateStatus'
  >;
  examParticipationRepository: Pick<ExamParticipationRepository, 'findById'>;
  consentRepository?: unknown;
  proctoringAiJobRepository?: unknown;
  db?: any;
};

type DataRequestInputWithClock = CreateProctoringDataRequestInput & {
  now?: Date;
};

type CleanupActor = {
  actorType: 'system' | 'user';
  actorId?: string | null;
};

type CleanupTableResult = {
  table: string;
  action: 'deleted';
  rowsDeleted: number;
};

const CLEANUP_TABLES = [
  {
    name: 'exam_proctoring_events',
    table: examProctoringEvents,
    column: examProctoringEvents.participationId,
  },
  {
    name: 'exam_proctoring_final_flush_receipts',
    table: examProctoringFinalFlushReceipts,
    column: examProctoringFinalFlushReceipts.participationId,
  },
  {
    name: 'exam_proctoring_summaries',
    table: examProctoringSummaries,
    column: examProctoringSummaries.participationId,
  },
  {
    name: 'proctoring_ai_jobs',
    table: proctoringAiJobs,
    column: proctoringAiJobs.participationId,
  },
  {
    name: 'exam_proctoring_sessions',
    table: examProctoringSessions,
    column: examProctoringSessions.participationId,
  },
  {
    name: 'exam_proctoring_prechecks',
    table: examProctoringPrechecks,
    column: examProctoringPrechecks.participationId,
  },
  {
    name: 'exam_proctoring_bypass_codes',
    table: examProctoringBypassCodes,
    column: examProctoringBypassCodes.participationId,
  },
  {
    name: 'exam_proctoring_consents',
    table: examProctoringConsents,
    column: examProctoringConsents.participationId,
  },
];

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function readRowCount(result: unknown): number {
  const maybeRowCount = (result as { rowCount?: number } | undefined)?.rowCount;
  return typeof maybeRowCount === 'number' ? maybeRowCount : 0;
}

export class ProctoringDataRequestService {
  private readonly database: any;

  constructor(private readonly deps: ProctoringDataRequestServiceDependencies) {
    this.database = deps.db ?? db;
  }

  async createDataRequest(
    participationId: string,
    candidateUserId: string | undefined,
    input: DataRequestInputWithClock,
  ) {
    if (!candidateUserId) {
      throw new AppException('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const participation = await this.deps.examParticipationRepository.findById(participationId);
    if (!participation || participation.userId !== candidateUserId) {
      throw new AppException('Participation not found', 404, 'PARTICIPATION_NOT_FOUND');
    }

    const requestedAt = input.now ?? new Date();
    const statutoryDueAt = new Date(input.statutoryDueAt);

    return this.deps.dataRequestRepository.insert({
      examId: participation.examId,
      participationId,
      candidateUserId,
      requestType: input.requestType,
      status: 'requested',
      requestedAt,
      statutoryDueAt,
      internalTargetDueAt: addHours(requestedAt, 72),
      resultJson: input.reason ? { reason: input.reason } : null,
    } as any);
  }

  async executeDataRequestCleanup(requestId: string, actor: CleanupActor) {
    const request = await this.deps.dataRequestRepository.findById(requestId);
    if (!request) {
      throw new AppException('Proctoring data request not found', 404, 'PROCTORING_DATA_REQUEST_NOT_FOUND');
    }
    if (!request.participationId) {
      throw new AppException(
        'Participation-scoped cleanup is required for Phase 1',
        422,
        'PROCTORING_DATA_REQUEST_SCOPE_UNSUPPORTED',
      );
    }

    const startedAt = new Date();
    const tablesTouched = await this.database.transaction(async (tx: any) => {
      const results: CleanupTableResult[] = [];
      for (const target of CLEANUP_TABLES) {
        const deleteResult = await tx.delete(target.table).where(eq(target.column as any, request.participationId));
        results.push({
          table: target.name,
          action: 'deleted',
          rowsDeleted: readRowCount(deleteResult),
        });
      }
      return results;
    });
    const completedAt = new Date();
    const resultJson = {
      requestType: request.requestType,
      tablesTouched,
      rowsDeleted: tablesTouched.reduce((total: number, row: CleanupTableResult) => total + row.rowsDeleted, 0),
      skippedRows: [],
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      actor: {
        actorType: actor.actorType,
        actorId: actor.actorId ?? null,
      },
      includedAiJobStatuses: ['pending', 'running', 'completed', 'retry', 'dead_letter', 'skipped'],
    };

    return this.deps.dataRequestRepository.updateStatus(requestId, {
      status: 'completed',
      completedAt,
      resultJson,
      updatedAt: completedAt,
    } as any);
  }
}

export function createProctoringDataRequestService(): ProctoringDataRequestService {
  return new ProctoringDataRequestService({
    dataRequestRepository: new ProctoringDataRequestRepository(),
    examParticipationRepository: new ExamParticipationRepository(),
  });
}
