#!/usr/bin/env ts-node

import { logger } from '@backend/shared/utils';
import { config } from 'dotenv';

import { createSandboxBreaker } from './grpc/circuit-breaker';
import { createSandboxGrpcClient } from './grpc/client';
import { createProctoringAiWorkerService } from './services/proctoring-ai-worker.service';
import { createWorkerService, IWorkerService } from './services/worker.service';

type ShutdownSignal = 'SIGINT' | 'SIGTERM' | 'uncaughtException';

function envFlagEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
}

function registerProcessHandlers(workerServices: IWorkerService[]): void {
  const shutdown = async (signal: ShutdownSignal) => {
    logger.info('Stopping worker...', { signal });

    try {
      await Promise.all(workerServices.map(workerService => workerService.stop()));
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
  const proctoringAiEnabled = envFlagEnabled(process.env.PROCTORING_AI_ENABLED, true);
  const proctoringAiShadowMode = envFlagEnabled(process.env.PROCTORING_AI_SHADOW_MODE, true);
  const workerServices: IWorkerService[] = [workerService];

  if (proctoringAiEnabled && proctoringAiShadowMode) {
    workerServices.push(createProctoringAiWorkerService());
  } else {
    logger.info('Proctoring AI worker disabled by configuration', {
      proctoringAiEnabled,
      proctoringAiShadowMode,
    });
  }

  registerProcessHandlers(workerServices);
  await workerService.start();
  if (workerServices.length > 1) {
    await workerServices[1]!.start();
  }
}

if (require.main === module) {
  void startWorkerProcess().catch(error => {
    logger.error('Failed to start worker', { error });
    process.exit(1);
  });
}
