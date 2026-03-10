import { logger } from '@backend/shared/utils';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';
import { createServer } from 'http';
import { sandboxService } from './sandbox.service';
import sandboxRoutes from './sandbox.routes';
import { startGrpcServer } from './grpc/server';
// Load environment variables
config();

// Standardized logger for sandbox
const app = express();
const server = createServer(app);
const PORT = process.env.SANDBOX_PORT || 4000;
const GRPC_PORT = parseInt(process.env.SANDBOX_GRPC_PORT || '50051');

// Security middleware
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

// Compression
app.use(
  compression({
    level: 6,
    threshold: 1024,
  })
);

// CORS
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/sandbox', sandboxRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const isHealthy = await sandboxService.healthCheck();
    const status = sandboxService.getStatus();

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      sandbox: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Sandbox health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
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

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Sandbox service error', { error: err.message, stack: err.stack });

  res.status(500).json({
    success: false,
    message: 'Internal sandbox error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Sandbox endpoint not found',
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`Stopping sandbox...`, { signal });

  try {
    // Cleanup active jobs
    logger.info('Cleaning up active jobs...');

    // Stop accepting new requests
    server.close(() => {
      logger.info('Sandbox server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Force exit');
      process.exit(1);
    }, 10000);
  } catch (error) {
    logger.error('Shutdown error', { error });
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  logger.error('Unhandled Rejection', { reason });
});

// Start HTTP server
server.listen(PORT, () => {
  logger.info('🚀 Sandbox HTTP Service Started', {
    port: PORT,
    security: 'enabled',
    monitoring: 'active',
    healthCheck: `http://localhost:${PORT}/health`,
  });
});

// Start gRPC server (Task 3.2)
startGrpcServer(GRPC_PORT);
logger.info('🔌 Sandbox gRPC Service Started', { port: GRPC_PORT });

// Test sandbox on startup
sandboxService
  .healthCheck()
  .then(isHealthy => {
    if (isHealthy) {
      logger.info('✅ Sandbox is ready for code execution');
    } else {
      logger.error('❌ Sandbox health check failed');
    }
  })
  .catch(error => {
    logger.error('❌ Sandbox initialization error', { error });
  });
