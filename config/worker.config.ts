export interface WorkerConfig {
  // Worker Configuration
  workerId: string;
  maxRetries: number;
  retryDelay: number;
  healthCheckInterval: number;

  // Queue Configuration
  queueName: string;
  batchSize: number;
  pollInterval: number;

  // Sandbox Configuration
  sandboxUrl: string;
  sandboxTimeout: number;

  // Processing Configuration
  maxConcurrentJobs: number;
  jobTimeout: number;

  // Monitoring Configuration
  enableMetrics: boolean;
  metricsInterval: number;
}

export const workerConfig: WorkerConfig = {
  // Worker Configuration
  workerId: process.env.WORKER_ID || `worker-${Date.now()}`,
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  retryDelay: parseInt(process.env.RETRY_DELAY || '5000'),
  healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),

  // Queue Configuration
  queueName: process.env.QUEUE_NAME || 'code_execution',
  batchSize: parseInt(process.env.BATCH_SIZE || '1'),
  pollInterval: parseInt(process.env.POLL_INTERVAL || '1000'),

  // Sandbox Configuration
  sandboxUrl: process.env.SANDBOX_URL || 'http://localhost:4000',
  sandboxTimeout: parseInt(process.env.SANDBOX_TIMEOUT || '60000'),

  // Processing Configuration
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '5'),
  jobTimeout: parseInt(process.env.JOB_TIMEOUT || '300000'), // 5 minutes

  // Monitoring Configuration
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  metricsInterval: parseInt(process.env.METRICS_INTERVAL || '60000'),
};
