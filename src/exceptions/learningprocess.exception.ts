import { BaseException } from './auth.exceptions';

export class InvalidLearningProcessException extends BaseException {
  constructor(message: string = 'Invalid learning process data') {
    super(message, 400, 'INVALID_LEARNING_PROCESS');
    this.name = 'InvalidLearningProcessException';
  }
}

export class UserIdRequiredException extends BaseException {
  constructor(message: string = 'User ID is required') {
    super(message, 400, 'USER_ID_REQUIRED');
    this.name = 'UserIdRequiredException';
  }
}

export class TopicIdRequiredException extends BaseException {
  constructor(message: string = 'Topic ID is required') {
    super(message, 400, 'TOPIC_ID_REQUIRED');
    this.name = 'TopicIdRequiredException';
  }
}

export class LessonIdRequiredException extends BaseException {
  constructor(message: string = 'Lesson ID is required') {
    super(message, 400, 'LESSON_ID_REQUIRED');
    this.name = 'LessonIdRequiredException';
  }
}
