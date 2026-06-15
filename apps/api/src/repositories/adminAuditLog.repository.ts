import { AdminAuditLogEntity, AdminAuditLogInsert, adminAuditLogs } from '@backend/shared/db/schema';

import { BaseRepository } from './base.repository';

export class AdminAuditLogRepository extends BaseRepository<
  typeof adminAuditLogs,
  AdminAuditLogEntity,
  AdminAuditLogInsert
> {
  constructor() {
    super(adminAuditLogs);
  }
}
