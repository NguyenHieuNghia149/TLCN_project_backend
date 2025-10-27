#!/usr/bin/env ts-node

import { config } from 'dotenv';
import { workerService } from './worker.service';

// Load environment variables
config();

async function startWorker(): Promise<void> {
  console.log('🚀 Starting Code Execution Worker...\n');

  try {
    // Start worker service
    await workerService.start();
  } catch (error) {
    console.error('❌ Failed to start worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down worker...`);

  try {
    await workerService.stop();
    console.log('👋 Worker stopped');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  console.error('❌ Uncaught Exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  console.error('❌ Unhandled Rejection:', reason);
});

// Start worker
startWorker().catch(error => {
  console.error('❌ Worker startup failed:', error);
  process.exit(1);
});
