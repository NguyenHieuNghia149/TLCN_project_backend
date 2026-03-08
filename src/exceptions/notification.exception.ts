import { BaseException } from './auth.exceptions';
import { ErrorCode } from '@/enums/error-codes';

export class NotificationNotFoundException extends BaseException {
  constructor(message: string = 'Notification not found') {
    super(message, 404, ErrorCode.NOTIFICATION_NOT_FOUND);
    this.name = 'NotificationNotFoundException';
  }
}

export class NotificationAccessDeniedException extends BaseException {
  constructor(message: string = 'Access denied to this notification') {
    super(message, 403, ErrorCode.NOTIFICATION_ACCESS_DENIED);
    this.name = 'NotificationAccessDeniedException';
  }
}
