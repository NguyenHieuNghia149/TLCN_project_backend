import { Router } from 'express';
import { SubmissionController } from '@backend/api/controllers/submission.controller';
import { authenticationToken } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { getSseService } from '@backend/api/services/sse.service';
import { createSubmissionService } from '@backend/api/services/submission.service';
import {
  CreateSubmissionSchema,
  GetSubmissionsQuerySchema,
} from '@backend/shared/validations/submission.validation';

/** Creates the submission router without touching Redis-backed SSE services at import time. */
export function createSubmissionRouter(): Router {
  const router = Router();
  const submissionService = createSubmissionService();
  const submissionController = new SubmissionController(submissionService, getSseService);

  const submissionRateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many submission requests from this IP, please try again later.',
  });

  const createSubmissionRateLimit = rateLimitMiddleware({
    windowMs: 5 * 1000,
    max: 5,
    message:
      'Too many submission creation requests from this IP, please wait 5 seconds before submitting again.',
  });

  router.get(
    '/queue/status',
    submissionRateLimit,
    submissionController.getQueueStatus.bind(submissionController)
  );

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
    submissionController.getProblemSubmissions.bind(submissionController)
  );

  router.get(
    '/problem/:problemId/me',
    authenticationToken,
    submissionRateLimit,
    submissionController.getProblemSubmissionsByUser.bind(submissionController)
  );

  router.get('/health', submissionRateLimit, (req, res) => {
    res.json({
      status: 'ok',
      service: 'submission',
      timestamp: new Date().toISOString(),
    });
  });

  router.post(
    '/run',
    authenticationToken,
    submissionRateLimit,
    validate(CreateSubmissionSchema),
    submissionController.runCode.bind(submissionController)
  );

  return router;
}

