import { BaseException } from './auth.exceptions';
import { ErrorCode } from '@backend/shared/types';

export class InvalidLearningProcessException extends BaseException {
  constructor(message: string = 'Invalid learning process data') {
    super(message, 400, ErrorCode.INVALID_LEARNING_PROCESS);
    this.name = 'InvalidLearningProcessException';
  }
}

export class UserIdRequiredException extends BaseException {
  constructor(message: string = 'User ID is required') {
    super(message, 400, ErrorCode.USER_ID_REQUIRED);
    this.name = 'UserIdRequiredException';
  }
}

export class TopicIdRequiredException extends BaseException {
  constructor(message: string = 'Topic ID is required') {
    super(message, 400, ErrorCode.TOPIC_ID_REQUIRED);
    this.name = 'TopicIdRequiredException';
  }
}

export class LessonIdRequiredException extends BaseException {
  constructor(message: string = 'Lesson ID is required') {
    super(message, 400, ErrorCode.LESSON_ID_REQUIRED);
    this.name = 'LessonIdRequiredException';
  }
}
