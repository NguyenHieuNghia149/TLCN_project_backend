import compression from 'compression';
import cors from 'cors';
import { config } from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Server, createServer } from 'http';
import * as grpc from '@grpc/grpc-js';
import { logger } from '@backend/shared/utils';
import { startGrpcServer } from './grpc/server';
import { createSandboxRouter } from './sandbox.routes';
import { createSandboxService, ISandboxService } from './sandbox.service';

export function createSandboxApp(sandboxService: ISandboxService): express.Express {
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
    })
  );

  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use('/api/sandbox', createSandboxRouter(sandboxService));

  app.get('/health', async (req: Request, res: Response) => {
    try {
      const isHealthy = await sandboxService.healthCheck();
      const status = sandboxService.getStatus();

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        sandbox: status,
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: 'unhealthy',
        error: 'Sandbox health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get('/', (req: Request, res: Response) => {
    res.json({
      service: 'Sandbox Service',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        execute: '/api/sandbox/execute',
        status: '/api/sandbox/status',
        test: '/api/sandbox/test',
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('Sandbox service error', { error: err.message, stack: err.stack });

    res.status(500).json({
      success: false,
      message: 'Internal sandbox error',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  });

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      message: 'Sandbox endpoint not found',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

function listenHttpServer(server: Server, port: number | string): Promise<Server> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise(resolve => {
    server.close(() => resolve());
  });
}

function shutdownGrpcServer(server: grpc.Server): Promise<void> {
  return new Promise(resolve => {
    server.tryShutdown(error => {
      if (error) {
        server.forceShutdown();
      }
      resolve();
    });
  });
}

function registerProcessHandlers(shutdown: (signal: string) => Promise<void>): void {
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.once('uncaughtException', error => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    void shutdown('uncaughtException');
  });

  process.once('unhandledRejection', reason => {
    logger.error('Unhandled Rejection', { reason });
  });
}

export async function startSandboxServer(): Promise<{
  httpServer: Server;
  grpcServer: grpc.Server;
}> {
  config();

  const sandboxService = createSandboxService();
  const app = createSandboxApp(sandboxService);
  const httpServer = createServer(app);
  const port = process.env.SANDBOX_PORT || 4000;
  const grpcPort = parseInt(process.env.SANDBOX_GRPC_PORT || '50051', 10);

  await listenHttpServer(httpServer, port);
  logger.info('Sandbox HTTP Service Started', {
    port,
    security: 'enabled',
    monitoring: 'active',
    healthCheck: `http://localhost:${port}/health`,
  });

  const grpcServer = await startGrpcServer(sandboxService, grpcPort);
  logger.info('Sandbox gRPC Service Started', { port: grpcPort });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info('Stopping sandbox...', { signal });

    const forceExitTimer = setTimeout(() => {
      logger.error('Force exit');
      process.exit(1);
    }, 10000);

    try {
      await Promise.all([closeHttpServer(httpServer), shutdownGrpcServer(grpcServer)]);
      clearTimeout(forceExitTimer);
      logger.info('Sandbox server closed');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error('Shutdown error', { error });
      process.exit(1);
    }
  };

  registerProcessHandlers(shutdown);

  sandboxService
    .healthCheck()
    .then(isHealthy => {
      if (isHealthy) {
        logger.info('Sandbox is ready for code execution');
      } else {
        logger.error('Sandbox health check failed');
      }
    })
    .catch(error => {
      logger.error('Sandbox initialization error', { error });
    });

  return { httpServer, grpcServer };
}

if (require.main === module) {
  void startSandboxServer().catch(error => {
    logger.error('Failed to start sandbox server', { error });
    process.exit(1);
  });
}
