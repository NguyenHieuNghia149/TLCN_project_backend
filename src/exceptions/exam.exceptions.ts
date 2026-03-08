import { BaseException } from './auth.exceptions';
import { ErrorCode } from '@/enums/error-codes';

export class ExamNotFoundException extends BaseException {
  constructor(message: string = 'Exam not found') {
    super(message, 404, ErrorCode.EXAM_NOT_FOUND);
    this.name = 'ExamNotFoundException';
  }
}

export class ExamIdRequiredException extends BaseException {
  constructor(message: string = 'Exam ID is required') {
    super(message, 400, ErrorCode.MISSING_EXAM_ID);
    this.name = 'ExamIdRequiredException';
  }
}

export class InvalidExamDateException extends BaseException {
  constructor(message: string = 'Invalid exam date range') {
    super(message, 400, ErrorCode.INVALID_EXAM_DATE);
    this.name = 'InvalidExamDateException';
  }
}

export class ChallengeNotFoundException extends BaseException {
  constructor(message: string = 'Challenge not found') {
    super(message, 404, ErrorCode.CHALLENGE_NOT_FOUND);
    this.name = 'ChallengeNotFoundException';
  }
}

export class InvalidPasswordException extends BaseException {
  constructor(message: string = 'Invalid exam password') {
    super(message, 401, ErrorCode.INVALID_PASSWORD);
    this.name = 'InvalidPasswordException';
  }
}

export class ExamNotStartedException extends BaseException {
  constructor(message: string = 'Exam has not started yet') {
    super(message, 403, ErrorCode.EXAM_NOT_STARTED);
    this.name = 'ExamNotStartedException';
  }
}

export class ExamEndedException extends BaseException {
  constructor(message: string = 'Exam has already ended') {
    super(message, 403, ErrorCode.EXAM_ENDED);
    this.name = 'ExamEndedException';
  }
}

export class ExamAlreadyJoinedException extends BaseException {
  constructor(message: string = 'User has already joined this exam') {
    super(message, 409, ErrorCode.EXAM_ALREADY_JOINED);
    this.name = 'ExamAlreadyJoinedException';
  }
}

export class ExamParticipationNotFoundException extends BaseException {
  constructor(message: string = 'Exam participation not found') {
    super(message, 404, ErrorCode.PARTICIPATION_NOT_FOUND);
    this.name = 'ExamParticipationNotFoundException';
  }
}

export class ExamTimeoutException extends BaseException {
  constructor(message: string = 'Exam time limit exceeded') {
    super(message, 403, ErrorCode.EXAM_TIMEOUT);
    this.name = 'ExamTimeoutException';
  }
}
