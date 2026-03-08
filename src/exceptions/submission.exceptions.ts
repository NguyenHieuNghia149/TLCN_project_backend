import { BaseException } from './auth.exceptions';
import { ErrorCode } from '@/enums/error-codes';

export class UserNotAuthenticatedException extends BaseException {
  constructor(message: string = 'User not authenticated') {
    super(message, 401, ErrorCode.UNAUTHORIZED);
    this.name = 'UserNotAuthenticatedException';
  }
}

export class SubmissionIdRequiredException extends BaseException {
  constructor(message: string = 'Submission ID is required') {
    super(message, 400, ErrorCode.MISSING_SUBMISSION_ID);
    this.name = 'SubmissionIdRequiredException';
  }
}

export class SubmissionNotFoundException extends BaseException {
  constructor(message: string = 'Submission not found') {
    super(message, 404, ErrorCode.SUBMISSION_NOT_FOUND);
    this.name = 'SubmissionNotFoundException';
  }
}

export class ProblemIdRequiredException extends BaseException {
  constructor(message: string = 'Problem ID is required') {
    super(message, 400, ErrorCode.MISSING_PROBLEM_ID);
    this.name = 'ProblemIdRequiredException';
  }
}
