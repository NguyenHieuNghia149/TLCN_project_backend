import { BaseException } from './auth.exceptions';

export class TopicAlreadyExistsException extends BaseException {
  constructor(message: string = 'Topic name already exists') {
    super(message, 409, 'TOPIC_ALREADY_EXISTS');
    this.name = 'TopicAlreadyExistsException';
  }
}
