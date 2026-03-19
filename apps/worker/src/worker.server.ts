#!/usr/bin/env ts-node

import { createServer, Server } from 'node:http';

import { logger } from '@backend/shared/utils';
import { config } from 'dotenv';

import { workerService } from './worker.service';

config();

let metricsServer: Server | null = null;

function startMetricsServer(): void {
  const port = Number(process.env.WORKER_METRICS_PORT || 3013);

  metricsServer = createServer((req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(workerService.getStats()));
  });

  metricsServer.listen(port, () => {
    logger.info('Worker metrics server listening', { port });
  });
}

async function stopMetricsServer(): Promise<void> {
  if (!metricsServer) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    metricsServer?.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  metricsServer = null;
}

async function startWorker(): Promise<void> {
  logger.info('Starting Code Execution Worker...');

  try {
    await workerService.start();
    startMetricsServer();
  } catch (error) {
    logger.error('Failed to start worker', { error });
    process.exit(1);
  }
}

const shutdown = async (signal: string) => {
  logger.info(`Stopping worker...`, { signal });

  try {
    await stopMetricsServer();
    await workerService.stop();
    logger.info('Worker stopped');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', error => {
  logger.error('Uncaught Exception', { error });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  logger.error('Unhandled Rejection', { reason });
});

startWorker().catch(error => {
  logger.error('Worker startup failed', { error });
  process.exit(1);
});
