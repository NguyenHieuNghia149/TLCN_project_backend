export class LessonDetailNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LessonDetailNotFoundError';
  }
}

export class LessonNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LessonNotFoundError';
  }
}
