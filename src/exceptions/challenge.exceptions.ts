import { BaseException } from './auth.exceptions';
import { ErrorCode } from '@/enums/error-codes';

export class ChallengeHasSubmissionsException extends BaseException {
  constructor(
    message: string = 'Cannot modify or delete challenge: Users have already submitted solutions to this challenge.'
  ) {
    super(message, 400, ErrorCode.CHALLENGE_HAS_SUBMISSIONS);
    this.name = 'ChallengeHasSubmissionsException';
  }
}
