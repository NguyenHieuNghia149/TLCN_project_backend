import { BaseException } from './auth.exceptions';

export class ExamNotFoundException extends BaseException {
  constructor(message: string = 'Exam not found') {
    super(message, 404, 'EXAM_NOT_FOUND');
    this.name = 'ExamNotFoundException';
  }
}

export class ExamIdRequiredException extends BaseException {
  constructor(message: string = 'Exam ID is required') {
    super(message, 400, 'MISSING_EXAM_ID');
    this.name = 'ExamIdRequiredException';
  }
}

export class InvalidExamDateException extends BaseException {
  constructor(message: string = 'Invalid exam date range') {
    super(message, 400, 'INVALID_EXAM_DATE');
    this.name = 'InvalidExamDateException';
  }
}

export class ChallengeNotFoundException extends BaseException {
  constructor(message: string = 'Challenge not found') {
    super(message, 404, 'CHALLENGE_NOT_FOUND');
    this.name = 'ChallengeNotFoundException';
  }
}

export class InvalidPasswordException extends BaseException {
  constructor(message: string = 'Invalid exam password') {
    super(message, 401, 'INVALID_PASSWORD');
    this.name = 'InvalidPasswordException';
  }
}

export class ExamNotStartedException extends BaseException {
  constructor(message: string = 'Exam has not started yet') {
    super(message, 403, 'EXAM_NOT_STARTED');
    this.name = 'ExamNotStartedException';
  }
}

export class ExamEndedException extends BaseException {
  constructor(message: string = 'Exam has already ended') {
    super(message, 403, 'EXAM_ENDED');
    this.name = 'ExamEndedException';
  }
}

export class ExamAlreadyJoinedException extends BaseException {
  constructor(message: string = 'User has already joined this exam') {
    super(message, 409, 'EXAM_ALREADY_JOINED');
    this.name = 'ExamAlreadyJoinedException';
  }
}

export class ExamParticipationNotFoundException extends BaseException {
  constructor(message: string = 'Exam participation not found') {
    super(message, 404, 'PARTICIPATION_NOT_FOUND');
    this.name = 'ExamParticipationNotFoundException';
  }
}

export class ExamTimeoutException extends BaseException {
  constructor(message: string = 'Exam time limit exceeded') {
    super(message, 403, 'EXAM_TIMEOUT');
    this.name = 'ExamTimeoutException';
  }
}
