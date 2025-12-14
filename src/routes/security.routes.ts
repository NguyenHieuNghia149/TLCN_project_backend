import { Router } from 'express';
import { SecurityController } from '@/controllers/security.controller';
import { authenticationToken } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';

const router = Router();
const securityController = new SecurityController();

// Rate limiting for security endpoints
const securityRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 20 requests per windowMs
  message: 'Too many security requests from this IP, please try again later.',
});

// Security monitoring endpoints (admin only)
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

// Test endpoint (for development/testing)
router.post(
  '/test',
  authenticationToken,
  securityRateLimit,
  securityController.testSecurityValidation.bind(securityController)
);

// Error handling middleware

export default router;
