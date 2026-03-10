import { successResponse } from '@backend/shared/utils';
import { Request, Response, NextFunction } from 'express';

export const responseMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;
  res.json = function (body: any) {
    // Avoid double wrapping
    if (body && typeof body === 'object' && 'success' in body) {
      return originalJson.call(this, body);
    }
    return originalJson.call(this, successResponse(body));
  };
  next();
};
