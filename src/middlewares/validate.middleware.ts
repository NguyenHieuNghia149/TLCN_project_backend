import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

type Segments = 'body' | 'query' | 'params';

export const validate =
  (schema: z.ZodSchema, segment: Segments = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[segment]);
    if (!result.success) {
      res.status(400).json({
        message: 'Validation error',
        errors: result.error.flatten(),
      });
      return;
    }
    // Gán lại dữ liệu đã parse để service nhận đúng kiểu
    (req as any)[segment] = result.data;
    next();
  };
