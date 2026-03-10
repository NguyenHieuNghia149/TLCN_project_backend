#!/usr/bin/env ts-node

import { logger } from '@backend/shared/utils';
import { config } from 'dotenv';
import { workerService } from './worker.service';
// Load environment variables
config();

// Standardized logger for worker
async function startWorker(): Promise<void> {
  logger.info('Starting Code Execution Worker...');

  try {
    // Start worker service
    await workerService.start();
  } catch (error) {
    logger.error('Failed to start worker', { error });
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`Stopping worker...`, { signal });

  try {
    await workerService.stop();
    logger.info('Worker stopped');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception', { error });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  logger.error('Unhandled Rejection', { reason });
});

// Start worker
startWorker().catch(error => {
  logger.error('Worker startup failed', { error });
  process.exit(1);
});
