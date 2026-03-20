import { rateLimitMiddleware } from '@backend/shared/http/rate-limit';
import { Router } from 'express';
import { SandboxController } from './sandbox.controller';
import { ISandboxService } from './sandbox.service';

export function createSandboxRouter(sandboxService: ISandboxService): Router {
  const router = Router();
  const sandboxController = new SandboxController(sandboxService);

  const sandboxRateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many sandbox requests from this IP, please try again later.',
  });

  router.post('/execute', sandboxRateLimit, sandboxController.executeCode.bind(sandboxController));
  router.get('/status', sandboxRateLimit, sandboxController.getStatus.bind(sandboxController));
  router.get('/health', sandboxRateLimit, sandboxController.healthCheck.bind(sandboxController));
  router.get('/test', sandboxRateLimit, sandboxController.testSandbox.bind(sandboxController));

  return router;
}
