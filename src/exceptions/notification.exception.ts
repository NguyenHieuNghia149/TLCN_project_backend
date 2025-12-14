import { BaseException } from './auth.exceptions';

export class NotificationNotFoundException extends BaseException {
  constructor(message: string = 'Notification not found') {
    super(message, 404, 'NOTIFICATION_NOT_FOUND');
    this.name = 'NotificationNotFoundException';
  }
}

export class NotificationAccessDeniedException extends BaseException {
  constructor(message: string = 'Access denied to this notification') {
    super(message, 403, 'NOTIFICATION_ACCESS_DENIED');
    this.name = 'NotificationAccessDeniedException';
  }
}
