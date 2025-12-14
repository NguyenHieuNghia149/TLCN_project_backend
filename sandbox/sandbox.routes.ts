import { Router } from 'express';
import { SandboxController } from './sandbox.controller';
import { rateLimitMiddleware } from '../src/middlewares/ratelimit.middleware';

const router = Router();
const sandboxController = new SandboxController();

// Rate limiting for sandbox endpoints
const sandboxRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 100 requests per windowMs
  message: 'Too many sandbox requests from this IP, please try again later.',
});

// Sandbox execution endpoint
router.post('/execute', sandboxRateLimit, sandboxController.executeCode.bind(sandboxController));

// Sandbox status endpoint
router.get('/status', sandboxRateLimit, sandboxController.getStatus.bind(sandboxController));

// Health check endpoint
router.get('/health', sandboxRateLimit, sandboxController.healthCheck.bind(sandboxController));

// Test sandbox endpoint
router.get('/test', sandboxRateLimit, sandboxController.testSandbox.bind(sandboxController));

export default router;
