import { BaseException } from './auth.exceptions';
import { ErrorCode } from '@backend/shared/types';

export class TopicAlreadyExistsException extends BaseException {
  constructor(message: string = 'Topic name already exists') {
    super(message, 409, ErrorCode.TOPIC_ALREADY_EXISTS);
    this.name = 'TopicAlreadyExistsException';
  }
}
