import { AppException } from './base.exception';
import { ErrorCode } from '@backend/shared/types';

export { AppException as BaseException };

export class ValidationException extends AppException {
  constructor(message: string, details?: any) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
    this.name = 'ValidationException';
  }
}

export class AuthenticationException extends AppException {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, ErrorCode.AUTHENTICATION_ERROR);
    this.name = 'AuthenticationException';
  }
}

export class AuthorizationException extends AppException {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, ErrorCode.AUTHORIZATION_ERROR);
    this.name = 'AuthorizationException';
  }
}

export class UserNotFoundException extends AppException {
  constructor(message: string = 'User not found') {
    super(message, 404, ErrorCode.USER_NOT_FOUND);
    this.name = 'UserNotFoundException';
  }
}

export class UserAlreadyExistsException extends AppException {
  constructor(message: string = 'User already exists') {
    super(message, 409, ErrorCode.USER_ALREADY_EXISTS);
    this.name = 'UserAlreadyExistsException';
  }
}

export class InvalidCredentialsException extends AppException {
  constructor(message: string = 'Invalid credentials') {
    super(message, 401, ErrorCode.INVALID_CREDENTIALS);
    this.name = 'InvalidCredentialsException';
  }
}

export class AccountLockedException extends AppException {
  constructor(message: string = 'Account is locked due to too many failed login attempts') {
    super(message, 423, ErrorCode.ACCOUNT_LOCKED);
    this.name = 'AccountLockedException';
  }
}

export class TokenExpiredException extends AppException {
  constructor(message: string = 'Token has expired') {
    super(message, 401, ErrorCode.TOKEN_EXPIRED);
    this.name = 'TokenExpiredException';
  }
}

export class InvalidTokenException extends AppException {
  constructor(message: string = 'Invalid token') {
    super(message, 401, ErrorCode.INVALID_TOKEN);
    this.name = 'InvalidTokenException';
  }
}

export class RefreshTokenNotFoundException extends AppException {
  constructor(message: string = 'Refresh token not found') {
    super(message, 404, ErrorCode.REFRESH_TOKEN_NOT_FOUND);
    this.name = 'RefreshTokenNotFoundException';
  }
}

export class RefreshTokenExpiredException extends AppException {
  constructor(message: string = 'Refresh token expired') {
    super(message, 401, ErrorCode.REFRESH_TOKEN_EXPIRED);
    this.name = 'RefreshTokenExpiredException';
  }
}

export class EmailNotVerifiedException extends AppException {
  constructor(message: string = 'Email address not verified') {
    super(message, 403, ErrorCode.EMAIL_NOT_VERIFIED);
    this.name = 'EmailNotVerifiedException';
  }
}

export class RateLimitExceededException extends AppException {
  constructor(message: string = 'Too many requests, please try again later') {
    super(message, 429, ErrorCode.RATE_LIMIT_EXCEEDED);
    this.name = 'RateLimitExceededException';
  }
}

export class PasswordResetTokenExpiredException extends AppException {
  constructor(message: string = 'Password reset token has expired') {
    super(message, 400, ErrorCode.PASSWORD_RESET_TOKEN_EXPIRED);
    this.name = 'PasswordResetTokenExpiredException';
  }
}

export class EmailVerificationTokenExpiredException extends AppException {
  constructor(message: string = 'Email verification token has expired') {
    super(message, 400, ErrorCode.EMAIL_VERIFICATION_TOKEN_EXPIRED);
    this.name = 'EmailVerificationTokenExpiredException';
  }
}

// Error handler utility
export class ErrorHandler {
  static isOperationalError(error: Error): boolean {
    if (error instanceof AppException) {
      return error.isOperational;
    }
    return false;
  }

  static getErrorResponse(error: Error): {
    statusCode: number;
    message: string;
    code: string;
    timestamp: string;
  } {
    if (error instanceof AppException) {
      return {
        statusCode: error.statusCode,
        message: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      };
    }

    // For non-operational errors, return generic error
    return {
      statusCode: 500,
      message: 'Internal server error',
      code: ErrorCode.INTERNAL_ERROR,
      timestamp: new Date().toISOString(),
    };
  }
}
