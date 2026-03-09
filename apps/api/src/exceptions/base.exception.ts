import { ErrorCode } from '@backend/shared/types';

export class AppException extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode | string;
  public readonly isOperational: boolean;
  public readonly details: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: ErrorCode | string = ErrorCode.INTERNAL_ERROR,
    details: any = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}
