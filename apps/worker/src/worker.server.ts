#!/usr/bin/env ts-node

import { logger } from '@backend/shared/utils';
import { config } from 'dotenv';

import { workerService } from './worker.service';

config();

async function startWorker(): Promise<void> {
  logger.info('Starting Code Execution Worker...');

  try {
    await workerService.start();
  } catch (error) {
    logger.error('Failed to start worker', { error });
    process.exit(1);
  }
}

const shutdown = async (signal: string) => {
  logger.info('Stopping worker...', { signal });

  try {
    await workerService.stop();
    logger.info('Worker stopped');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('uncaughtException', error => {
  logger.error('Uncaught Exception', { error });
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  logger.error('Unhandled Rejection', { reason });
});

void startWorker();
