import { BaseException } from './auth.exceptions';

export class ChallengeHasSubmissionsException extends BaseException {
  constructor(
    message: string = 'Cannot modify or delete challenge: Users have already submitted solutions to this challenge.'
  ) {
    super(message, 400, 'CHALLENGE_HAS_SUBMISSIONS');
    this.name = 'ChallengeHasSubmissionsException';
  }
}
