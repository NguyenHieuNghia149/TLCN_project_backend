import { Router } from 'express';
import { SubmissionController } from '@/controllers/submission.controller';
import { authenticationToken } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { SubmissionService } from '@/services/submission.service';

const router = Router();
const submissionService = new SubmissionService();
const submissionController = new SubmissionController(submissionService);
import {
  CreateSubmissionSchema,
  GetSubmissionsQuerySchema,
} from '@/validations/submission.validation';

// Rate limiting
const submissionRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 50 submission requests per windowMs
  message: 'Too many submission requests from this IP, please try again later.',
});

const createSubmissionRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 10 submission creation requests per windowMs
  message: 'Too many submission creation requests from this IP, please try again later.',
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

// Error handling middleware
router.use(SubmissionController.errorHandler);

export default router;
