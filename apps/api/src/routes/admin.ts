import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { logger } from '@backend/shared/utils';
import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { queueService } from '../services/queue.service';

const adminRouter = Router();
const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(queueService.queue)],
  serverAdapter,
});

function safeEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function sendUnauthorized(res: Response): Response {
  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
  return res.status(401).json({
    success: false,
    message: 'Authentication required',
    code: 'BULL_BOARD_AUTH_REQUIRED',
  });
}

function bullBoardBasicAuth(req: Request, res: Response, next: NextFunction): Response | void {
  const username = process.env.BULL_BOARD_USERNAME;
  const password = process.env.BULL_BOARD_PASSWORD;

  if (!username || !password) {
    logger.warn('Bull-board credentials are not configured');
    return res.status(503).json({
      success: false,
      message: 'Bull-board credentials are not configured',
      code: 'BULL_BOARD_NOT_CONFIGURED',
    });
  }

  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Basic ')) {
    return sendUnauthorized(res);
  }

  const encodedCredentials = authorization.slice('Basic '.length).trim();
  const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf8');
  const separatorIndex = decodedCredentials.indexOf(':');

  if (separatorIndex === -1) {
    return sendUnauthorized(res);
  }

  const providedUsername = decodedCredentials.slice(0, separatorIndex);
  const providedPassword = decodedCredentials.slice(separatorIndex + 1);

  if (!safeEqual(providedUsername, username) || !safeEqual(providedPassword, password)) {
    return sendUnauthorized(res);
  }

  next();
}

adminRouter.use(bullBoardBasicAuth, serverAdapter.getRouter());

export default adminRouter;