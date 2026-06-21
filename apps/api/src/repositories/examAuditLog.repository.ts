import { examAuditLogs, ExamAuditLogEntity, ExamAuditLogInsert } from '@backend/shared/db/schema';

import { BaseRepository } from './base.repository';

export class ExamAuditLogRepository extends BaseRepository<
  typeof examAuditLogs,
  ExamAuditLogEntity,
  ExamAuditLogInsert
> {
  constructor() {
    super(examAuditLogs);
  }
}
