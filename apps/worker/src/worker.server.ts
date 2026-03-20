#!/usr/bin/env ts-node

import { logger } from '@backend/shared/utils';
import { config } from 'dotenv';

import { createSandboxBreaker } from './grpc/circuit-breaker';
import { createSandboxGrpcClient } from './grpc/client';
import { createWorkerService, IWorkerService } from './services/worker.service';

type ShutdownSignal = 'SIGINT' | 'SIGTERM' | 'uncaughtException';

function registerProcessHandlers(workerService: IWorkerService): void {
  const shutdown = async (signal: ShutdownSignal) => {
    logger.info('Stopping worker...', { signal });

    try {
      await workerService.stop();
      logger.info('Worker stopped');
      process.exit(signal === 'uncaughtException' ? 1 : 0);
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
}

export async function startWorkerProcess(): Promise<void> {
  config();
  logger.info('Starting Code Execution Worker...');

  const sandboxClient = createSandboxGrpcClient();
  const workerService = createWorkerService({
    sandboxClient,
    createBreaker: createSandboxBreaker,
  });

  registerProcessHandlers(workerService);
  await workerService.start();
}

if (require.main === module) {
  void startWorkerProcess().catch(error => {
    logger.error('Failed to start worker', { error });
    process.exit(1);
  });
}
