import { Router } from 'express';
import { SubmissionController } from '@backend/api/controllers/submission.controller';
import { authenticationToken } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { SubmissionService } from '@backend/api/services/submission.service';

const router = Router();
const submissionService = new SubmissionService();
const submissionController = new SubmissionController(submissionService);
import {
  CreateSubmissionSchema,
  GetSubmissionsQuerySchema,
} from '@backend/shared/validations/submission.validation';

// Rate limiting
const submissionRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 submission requests per windowMs
  message: 'Too many submission requests from this IP, please try again later.',
});

const createSubmissionRateLimit = rateLimitMiddleware({
  windowMs: 5 * 1000, // 5 seconds
  max: 5, // limit each IP to 1 submission creation request per windowMs
  message:
    'Too many submission creation requests from this IP, please wait 5 seconds before submitting again.',
});

// Public routes (no authentication required)
router.get(
  '/queue/status',
  submissionRateLimit,
  submissionController.getQueueStatus.bind(submissionController)
);

// Protected routes (require authentication)
router.post(
  '/',
  authenticationToken,
  createSubmissionRateLimit,
  validate(CreateSubmissionSchema),
  submissionController.createSubmission.bind(submissionController)
);

router.get(
  '/stream/:submissionId',
  authenticationToken,
  // Note: We don't use strict submissionRateLimit for SSE endpoint to allow reconnection,
  // or use a separate lighter rate limiter if needed. For now, authenticationToken defends it.
  submissionController.streamSubmissionStatus.bind(submissionController)
);

router.get(
  '/:submissionId',
  authenticationToken,
  submissionRateLimit,
  submissionController.getSubmissionStatus.bind(submissionController)
);

router.get(
  '/:submissionId/results',
  authenticationToken,
  submissionRateLimit,
  submissionController.getSubmissionResults.bind(submissionController)
);

router.get(
  '/user/my-submissions',
  authenticationToken,
  submissionRateLimit,
  validate(GetSubmissionsQuerySchema, 'query'),
  submissionController.getUserSubmissions.bind(submissionController)
);

router.get(
  '/problem/:problemId',
  authenticationToken,
  submissionRateLimit,
  //validate(GetSubmissionsQuerySchema),
  submissionController.getProblemSubmissions.bind(submissionController)
);

router.get(
  '/problem/:problemId/me',
  authenticationToken,
  submissionRateLimit,
  // validate(GetSubmissionsQuerySchema),
  submissionController.getProblemSubmissionsByUser.bind(submissionController)
);

// Health check for submission service
router.get('/health', submissionRateLimit, (req, res) => {
  res.json({
    status: 'ok',
    service: 'submission',
    timestamp: new Date().toISOString(),
  });
});

// Run code immediately without creating a submission record
router.post(
  '/run',
  authenticationToken,
  submissionRateLimit,
  validate(CreateSubmissionSchema),
  submissionController.runCode.bind(submissionController)
);

export default router;
