import { BaseException } from './auth.exceptions';

export class LessonDetailNotFoundError extends BaseException {
  constructor(message: string = 'Lesson detail not found') {
    super(message, 404, 'LESSON_DETAIL_NOT_FOUND');
    this.name = 'LessonDetailNotFoundError';
  }
}

export class LessonNotFoundError extends BaseException {
  constructor(message: string = 'Lesson not found') {
    super(message, 404, 'LESSON_NOT_FOUND');
    this.name = 'LessonNotFoundError';
  }
}
