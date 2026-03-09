import { Request, Response, NextFunction } from 'express';
import { AppException } from '../exceptions/base.exception';
import { errorResponse } from '@backend/shared/utils';

export const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Handle standard AppExceptions
  if (err instanceof AppException) {
    return res.status(err.statusCode).json(errorResponse(err.code, err.message, err.details));
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
  console.error('[ErrorMiddleware]', err);

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
