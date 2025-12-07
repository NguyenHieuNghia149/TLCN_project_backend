import { BaseException } from './auth.exceptions';

export class UserNotAuthenticatedException extends BaseException {
  constructor(message: string = 'User not authenticated') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class SubmissionIdRequiredException extends BaseException {
  constructor(message: string = 'Submission ID is required') {
    super(message, 400, 'MISSING_SUBMISSION_ID');
  }
}

export class SubmissionNotFoundException extends BaseException {
  constructor(message: string = 'Submission not found') {
    super(message, 404, 'SUBMISSION_NOT_FOUND');
  }
}

export class ProblemIdRequiredException extends BaseException {
  constructor(message: string = 'Problem ID is required') {
    super(message, 400, 'MISSING_PROBLEM_ID');
  }
}
