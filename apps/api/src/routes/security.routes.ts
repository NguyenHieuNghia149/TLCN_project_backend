import { Router } from 'express';
import { SecurityController } from '@backend/api/controllers/security.controller';
import { authenticationToken } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';

/** Creates the security router without constructing controllers at import time. */
export function createSecurityRouter(): Router {
  const router = Router();
  const securityController = new SecurityController();

  const securityRateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 'Too many security requests from this IP, please try again later.',
  });

  router.get(
    '/stats',
    authenticationToken,
    securityRateLimit,
    securityController.getSecurityStats.bind(securityController)
  );
  router.get(
    '/profile',
    authenticationToken,
    securityRateLimit,
    securityController.getSecurityProfile.bind(securityController)
  );
  router.post(
    '/export',
    authenticationToken,
    securityRateLimit,
    securityController.exportSecurityEvents.bind(securityController)
  );
  router.post(
    '/cleanup',
    authenticationToken,
    securityRateLimit,
    securityController.cleanupLogs.bind(securityController)
  );
  router.post(
    '/test',
    authenticationToken,
    securityRateLimit,
    securityController.testSecurityValidation.bind(securityController)
  );

  return router;
}
