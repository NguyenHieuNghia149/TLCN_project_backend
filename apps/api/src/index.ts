import { DatabaseService } from '@backend/shared/db/connection';
import { getJudgeQueueService } from '@backend/shared/runtime/judge-queue';
import { logger } from '@backend/shared/utils';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import path from 'path';
import { initializeWatchdogCron } from './cron/watchdog';
import { errorMiddleware } from './middlewares/error.middleware';
import { responseMiddleware } from './middlewares/response.middleware';
import { createAdminRouter } from './routes/admin';
import route from './routes';
import { examAutoSubmitService } from './services/exam-auto-submit.service';
import { initializeWebSocket } from './services/websocket.service';

const app = express();
const server = createServer(app);

config();

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

const allowedOrigins = [
  'http://localhost:3000',
  'https://app.algoforge.site',
  'https://sandbox.algoforge.site',
  'https://api.algoforge.site',
];

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

async function startServer() {
  try {
    logger.info('Connecting to database...');
    await DatabaseService.connect();

    logger.info('Running migrations...');
    await DatabaseService.runMigrations();

    initializeWebSocket(server);
    await examAutoSubmitService.start();

    const judgeQueueService = getJudgeQueueService();
    judgeQueueService
      .connect()
      .then(() => logger.info('Connected to Redis'))
      .catch(error =>
        logger.error('Redis connection failed (continuing without it):', error.message)
      );

    initializeWatchdogCron();

    app.use('/admin/queues', createAdminRouter());
    route(app);

    app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        code: 'NOT_FOUND',
      });
    });

    app.use(errorMiddleware);

    const PORT = process.env.PORT || 3001;

    server.listen(PORT, () => {
      logger.info(`server is running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
