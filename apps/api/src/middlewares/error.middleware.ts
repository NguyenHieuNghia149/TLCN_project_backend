import { errorResponse, logger } from '@backend/shared/utils';
import { Request, Response, NextFunction } from 'express';
import { AppException } from '../exceptions/base.exception';

export const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  const rawError = err as {
    type?: string;
    status?: number;
    statusCode?: number;
    message?: string;
    body?: unknown;
  };

  // Handle standard AppExceptions
  if (err instanceof AppException) {
    return res.status(err.statusCode).json(errorResponse(err.code, err.message, err.details));
  }

  // Handle malformed JSON body before hitting validators/controllers.
  if (
    rawError.type === 'entity.parse.failed' ||
    (err instanceof SyntaxError && typeof rawError.status === 'number' && 'body' in rawError)
  ) {
    const isDev = process.env.NODE_ENV === 'development';
    logger.warn('[ErrorMiddleware] Malformed JSON body', {
      message: rawError.message,
      type: rawError.type,
      statusCode: rawError.statusCode ?? rawError.status,
    });
    return res
      .status(400)
      .json(
        errorResponse(
          'MALFORMED_JSON',
          'Request body must be valid JSON',
          isDev
            ? {
                message: rawError.message,
                type: rawError.type,
              }
            : null,
        ),
      );
  }

  // Handle Postgres unique violation
  if (err.code === '23505') {
    return res.status(409).json(errorResponse('DUPLICATE_ERROR', 'Resource already exists'));
  }

  // Handle CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json(errorResponse('CORS_ERROR', 'CORS error: Origin not allowed'));
  }

  // Default to 500 server error
  const isDev = process.env.NODE_ENV === 'development';
  logger.error('[ErrorMiddleware]', err);

  return res
    .status(500)
    .json(
      errorResponse(
        'INTERNAL_ERROR',
        isDev ? err.message : 'Internal Server Error',
        isDev ? { stack: err.stack, ...err } : null
      )
    );
};
