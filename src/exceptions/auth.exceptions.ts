export class BaseException extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = 'AUTH_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationException extends BaseException {
  constructor(message: string, field?: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationException';
  }
}

export class AuthenticationException extends BaseException {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationException';
  }
}

export class AuthorizationException extends BaseException {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationException';
  }
}

export class UserNotFoundException extends BaseException {
  constructor(message: string = 'User not found') {
    super(message, 404, 'USER_NOT_FOUND');
    this.name = 'UserNotFoundException';
  }
}

export class UserAlreadyExistsException extends BaseException {
  constructor(message: string = 'User already exists') {
    super(message, 409, 'USER_ALREADY_EXISTS');
    this.name = 'UserAlreadyExistsException';
  }
}

export class InvalidCredentialsException extends BaseException {
  constructor(message: string = 'Invalid credentials') {
    super(message, 401, 'INVALID_CREDENTIALS');
    this.name = 'InvalidCredentialsException';
  }
}

export class AccountLockedException extends BaseException {
  constructor(message: string = 'Account is locked due to too many failed login attempts') {
    super(message, 423, 'ACCOUNT_LOCKED');
    this.name = 'AccountLockedException';
  }
}

export class TokenExpiredException extends BaseException {
  constructor(message: string = 'Token has expired') {
    super(message, 401, 'TOKEN_EXPIRED');
    this.name = 'TokenExpiredException';
  }
}

export class InvalidTokenException extends BaseException {
  constructor(message: string = 'Invalid token') {
    super(message, 401, 'INVALID_TOKEN');
    this.name = 'InvalidTokenException';
  }
}

export class RefreshTokenNotFoundException extends BaseException {
  constructor(message: string = 'Refresh token not found') {
    super(message, 404, 'REFRESH_TOKEN_NOT_FOUND');
    this.name = 'RefreshTokenNotFoundException';
  }
}

export class RefreshTokenExpiredException extends BaseException {
  constructor(message: string = 'Refresh token expired') {
    super(message, 401, 'REFRESH_TOKEN_EXPIRED');
    this.name = 'RefreshTokenExpiredException';
  }
}

export class EmailNotVerifiedException extends BaseException {
  constructor(message: string = 'Email address not verified') {
    super(message, 403, 'EMAIL_NOT_VERIFIED');
    this.name = 'EmailNotVerifiedException';
  }
}

export class RateLimitExceededException extends BaseException {
  constructor(message: string = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitExceededException';
  }
}

export class PasswordResetTokenExpiredException extends BaseException {
  constructor(message: string = 'Password reset token has expired') {
    super(message, 400, 'PASSWORD_RESET_TOKEN_EXPIRED');
    this.name = 'PasswordResetTokenExpiredException';
  }
}

export class EmailVerificationTokenExpiredException extends BaseException {
  constructor(message: string = 'Email verification token has expired') {
    super(message, 400, 'EMAIL_VERIFICATION_TOKEN_EXPIRED');
    this.name = 'EmailVerificationTokenExpiredException';
  }
}

// Error handler utility
export class ErrorHandler {
  static isOperationalError(error: Error): boolean {
    if (error instanceof BaseException) {
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
    if (error instanceof BaseException) {
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
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    };
  }
}
