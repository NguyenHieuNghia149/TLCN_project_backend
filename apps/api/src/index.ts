import { DatabaseService } from '@backend/shared/db/connection';
import { getJudgeQueueService } from '@backend/shared/runtime/judge-queue';
import { logger } from '@backend/shared/utils';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from 'dotenv';
import express, { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import { createServer, Server } from 'http';
import path from 'path';

import { errorMiddleware } from './middlewares/error.middleware';
import { responseMiddleware } from './middlewares/response.middleware';
import { registerRoutes } from './routes';

const allowedOrigins = [
  'http://localhost:3000',
  'https://app.algoforge.site',
  'https://sandbox.algoforge.site',
  'https://api.algoforge.site',
];

const adminRouterBindings = new WeakMap<Express, (handler: RequestHandler) => void>();

/** Registers a lazy admin route placeholder so the real router can be attached during startup. */
function registerAdminQueueMount(app: Express): void {
  let adminRouter: RequestHandler | null = null;
  adminRouterBindings.set(app, handler => {
    adminRouter = handler;
  });

  app.use('/admin/queues', (req: Request, res: Response, next: NextFunction) => {
    if (!adminRouter) {
      next();
      return;
    }

    adminRouter(req, res, next);
  });
}

/** Attaches the real admin router to an app created by createApiApp without changing middleware order. */
function attachAdminQueueRouter(app: Express, handler: RequestHandler): void {
  const bindAdminRouter = adminRouterBindings.get(app);
  if (!bindAdminRouter) {
    throw new Error('Admin queue mount is not registered for this API app');
  }

  bindAdminRouter(handler);
}

/** Builds the Express app without triggering startup-only side effects like DB, queue, or websocket init. */
export function createApiApp(): Express {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['cache-control'] && req.headers['cache-control'].includes('no-transform')) {
          return false;
        }
        return compression.filter(req, res);
      },
    })
  );

  app.use(
    cors({
      origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.info('Blocked by CORS:', origin);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });
  app.set('trust proxy', 1);

  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(responseMiddleware);
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  registerAdminQueueMount(app);
  registerRoutes(app);

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      message: 'API endpoint not found',
      code: 'NOT_FOUND',
    });
  });

  app.use(errorMiddleware);

  return app;
}

/** Starts the API server and wires startup-only infrastructure after the app factory has been created. */
export async function startApiServer(): Promise<{
  app: Express;
  server: Server;
}> {
  config();

  const app = createApiApp();
  const server = createServer(app);

  logger.info('Connecting to database...');
  await DatabaseService.connect();

  logger.info('Running migrations...');
  await DatabaseService.runMigrations();

  const { initializeWebSocket } = require('./services/websocket.service') as typeof import('./services/websocket.service');
  initializeWebSocket(server);

  const { examAutoSubmitService } = require('./services/exam-auto-submit.service') as typeof import('./services/exam-auto-submit.service');
  await examAutoSubmitService.start();

  getJudgeQueueService()
    .connect()
    .then(() => logger.info('Connected to Redis'))
    .catch((error: Error) =>
      logger.error('Redis connection failed (continuing without it):', error.message)
    );

  const { initializeWatchdogCron } = require('./cron/watchdog') as typeof import('./cron/watchdog');
  initializeWatchdogCron();

  const { createAdminRouter } = require('./routes/admin') as typeof import('./routes/admin');
  attachAdminQueueRouter(app, createAdminRouter());

  const port = process.env.PORT || 3001;
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('error', onError);
      reject(error);
    };

    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      logger.info(`server is running on port ${port}`);
      resolve();
    });
  });

  return { app, server };
}

if (require.main === module) {
  void startApiServer().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}
