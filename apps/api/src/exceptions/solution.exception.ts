import { BaseException } from './auth.exceptions';
import { ErrorCode } from '@backend/shared/types';

export class NotFoundException extends BaseException {
  constructor(message: string = 'Resource not found') {
    super(message, 404, ErrorCode.NOT_FOUND);
    this.name = 'NotFoundException';
  }
}
