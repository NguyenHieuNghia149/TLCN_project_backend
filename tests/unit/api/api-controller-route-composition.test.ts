import express, { RequestHandler } from 'express';
import request from 'supertest';
import type { Router } from 'express';

type MockRouteResponse = {
  status: (code: number) => {
    json: (body: unknown) => unknown;
  };
};

/** Creates a pass-through middleware used to isolate route factory tests. */
function createPassThroughMiddleware(): RequestHandler {
  return (req, res, next) => next();
}

/** Mocks shared auth, validate, and rate-limit middleware so route tests focus on wiring only. */
function mockRouteMiddlewareModules(): void {
  const passThroughMiddleware = createPassThroughMiddleware();

  jest.doMock('@backend/api/middlewares/auth.middleware', () => ({
    authenticationToken: passThroughMiddleware,
    optionalAuth: passThroughMiddleware,
    requireTeacherOrOwner: passThroughMiddleware,
    requireOwner: passThroughMiddleware,
    requireTeacher: passThroughMiddleware,
  }));
  jest.doMock('@backend/api/middlewares/validate.middleware', () => ({
    validate: jest.fn(() => passThroughMiddleware),
  }));
  jest.doMock('@backend/api/middlewares/ratelimit.middleware', () => ({
    rateLimitMiddleware: jest.fn(() => passThroughMiddleware),
    strictLimiter: passThroughMiddleware,
  }));
}

/** Builds a controller double that exposes the handler names required by a route factory. */
function createControllerDouble(methodNames: string[]): Record<string, jest.Mock> {
  return Object.fromEntries(
    methodNames.map(methodName => [
      methodName,
      jest.fn((req: unknown, res: MockRouteResponse) => res.status(200).json({ methodName })),
    ]),
  );
}

describe('API controller route composition', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('wires the comment route factory with createCommentService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'createComment',
      'getByLesson',
      'getByProblem',
      'getReplies',
      'updateComment',
      'deleteComment',
    ]);
    const createCommentService = jest.fn(() => serviceInstance);
    const CommentController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/comment.service', () => ({ createCommentService }));
    jest.doMock('@backend/api/controllers/comment.controller', () => ({ CommentController }));

    let createCommentRouter!: typeof import('@backend/api/routes/comment.routes').createCommentRouter;
    jest.isolateModules(() => {
      ({ createCommentRouter } = require('@backend/api/routes/comment.routes'));
    });

    const router = createCommentRouter();

    expect(createCommentService).toHaveBeenCalledTimes(1);
    expect(CommentController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the topic route factory with createTopicService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble(['list', 'getById', 'create', 'update', 'delete']);
    const createTopicService = jest.fn(() => serviceInstance);
    const TopicController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/topic.service', () => ({ createTopicService }));
    jest.doMock('@backend/api/controllers/topic.controller', () => ({ TopicController }));

    let createTopicRouter!: typeof import('@backend/api/routes/topic.routes').createTopicRouter;
    jest.isolateModules(() => {
      ({ createTopicRouter } = require('@backend/api/routes/topic.routes'));
    });

    const router = createTopicRouter();

    expect(createTopicService).toHaveBeenCalledTimes(1);
    expect(TopicController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the lesson route factory with createLessonService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble(['list', 'getById', 'create', 'update', 'delete']);
    const createLessonService = jest.fn(() => serviceInstance);
    const LessonController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/lesson.service', () => ({ createLessonService }));
    jest.doMock('@backend/api/controllers/lesson.controller', () => ({
      LessonController,
      __esModule: true,
      default: LessonController,
    }));

    let createLessonRouter!: typeof import('@backend/api/routes/lesson.routes').createLessonRouter;
    jest.isolateModules(() => {
      ({ createLessonRouter } = require('@backend/api/routes/lesson.routes'));
    });

    const router = createLessonRouter();

    expect(createLessonService).toHaveBeenCalledTimes(1);
    expect(LessonController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the notification route factory with createNotificationService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'getMyNotifications',
      'markAsRead',
      'markAllAsRead',
    ]);
    const createNotificationService = jest.fn(() => serviceInstance);
    const NotificationController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/notification.service', () => ({
      createNotificationService,
    }));
    jest.doMock('@backend/api/controllers/notification.controller', () => ({
      NotificationController,
    }));

    let createNotificationRouter!: typeof import('@backend/api/routes/notification.routes').createNotificationRouter;
    jest.isolateModules(() => {
      ({ createNotificationRouter } = require('@backend/api/routes/notification.routes'));
    });

    const router = createNotificationRouter();

    expect(createNotificationService).toHaveBeenCalledTimes(1);
    expect(NotificationController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the learning-process route factory with createLearningProcessService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'getUserProgress',
      'getTopicProgress',
      'getRecentTopic',
      'getUserLessonProgress',
      'getLessonProgress',
      'getRecentLesson',
    ]);
    const createLearningProcessService = jest.fn(() => serviceInstance);
    const LearningProcessController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/learningprocess.service', () => ({
      createLearningProcessService,
    }));
    jest.doMock('@backend/api/controllers/learningprocess.controller', () => ({
      LearningProcessController,
    }));

    let createLearningProcessRouter!: typeof import('@backend/api/routes/learningprocess.routes').createLearningProcessRouter;
    jest.isolateModules(() => {
      ({ createLearningProcessRouter } = require('@backend/api/routes/learningprocess.routes'));
    });

    const router = createLearningProcessRouter();

    expect(createLearningProcessService).toHaveBeenCalledTimes(1);
    expect(LearningProcessController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the learned-lesson route factory with createLearnedLessonService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'checkLessonCompletion',
      'getCompletedLessons',
      'markLessonCompleted',
    ]);
    const createLearnedLessonService = jest.fn(() => serviceInstance);
    const LearnedLessonController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/learned-lesson.service', () => ({
      createLearnedLessonService,
    }));
    jest.doMock('@backend/api/controllers/learned-lesson.controller', () => ({
      LearnedLessonController,
    }));

    let createLearnedLessonRouter!: typeof import('@backend/api/routes/learned-lesson.routes').createLearnedLessonRouter;
    jest.isolateModules(() => {
      ({ createLearnedLessonRouter } = require('@backend/api/routes/learned-lesson.routes'));
    });

    const router = createLearnedLessonRouter();

    expect(createLearnedLessonService).toHaveBeenCalledTimes(1);
    expect(LearnedLessonController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the lesson-detail route factory with createLessonDetailService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'getLessonById',
      'getLessonsByTopicId',
      'getAllLessons',
    ]);
    const createLessonDetailService = jest.fn(() => serviceInstance);
    const LessonDetailController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/lessonDetail.service', () => ({
      createLessonDetailService,
    }));
    jest.doMock('@backend/api/controllers/lessonDetail.controller', () => ({
      LessonDetailController,
    }));

    let createLessonDetailRouter!: typeof import('@backend/api/routes/lessonDetail.routes').createLessonDetailRouter;
    jest.isolateModules(() => {
      ({ createLessonDetailRouter } = require('@backend/api/routes/lessonDetail.routes'));
    });

    const router = createLessonDetailRouter();

    expect(createLessonDetailService).toHaveBeenCalledTimes(1);
    expect(LessonDetailController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the admin-user route factory with createAdminUserService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'list',
      'listTeachers',
      'getById',
      'create',
      'update',
      'remove',
    ]);
    const createAdminUserService = jest.fn(() => serviceInstance);
    const AdminUserController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/admin/adminUser.service', () => ({
      createAdminUserService,
    }));
    jest.doMock('@backend/api/controllers/admin/adminUser.controller', () => ({
      __esModule: true,
      default: AdminUserController,
    }));

    let createAdminUserRouter!: typeof import('@backend/api/routes/admin/adminUser.routes').createAdminUserRouter;
    jest.isolateModules(() => {
      ({ createAdminUserRouter } = require('@backend/api/routes/admin/adminUser.routes'));
    });

    const router = createAdminUserRouter();

    expect(createAdminUserService).toHaveBeenCalledTimes(1);
    expect(AdminUserController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the admin-teacher route factory with createAdminUserService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble(['list', 'create', 'update']);
    const createAdminUserService = jest.fn(() => serviceInstance);
    const AdminTeacherController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/admin/adminUser.service', () => ({
      createAdminUserService,
    }));
    jest.doMock('@backend/api/controllers/admin/adminTeacher.controller', () => ({
      __esModule: true,
      default: AdminTeacherController,
    }));

    let createAdminTeacherRouter!: typeof import('@backend/api/routes/admin/adminTeacher.routes').createAdminTeacherRouter;
    jest.isolateModules(() => {
      ({ createAdminTeacherRouter } = require('@backend/api/routes/admin/adminTeacher.routes'));
    });

    const router = createAdminTeacherRouter();

    expect(createAdminUserService).toHaveBeenCalledTimes(1);
    expect(AdminTeacherController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the admin-topic route factory with createAdminTopicService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'list',
      'getById',
      'create',
      'update',
      'delete',
      'getStats',
    ]);
    const createAdminTopicService = jest.fn(() => serviceInstance);
    const AdminTopicController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/admin/adminTopic.service', () => ({
      createAdminTopicService,
    }));
    jest.doMock('@backend/api/controllers/admin/adminTopic.controller', () => ({
      AdminTopicController,
    }));

    let createAdminTopicRouter!: typeof import('@backend/api/routes/admin/adminTopic.routes').createAdminTopicRouter;
    jest.isolateModules(() => {
      ({ createAdminTopicRouter } = require('@backend/api/routes/admin/adminTopic.routes'));
    });

    const router = createAdminTopicRouter();

    expect(createAdminTopicService).toHaveBeenCalledTimes(1);
    expect(AdminTopicController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the dashboard route factory with createDashboardService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble(['getStats']);
    const createDashboardService = jest.fn(() => serviceInstance);
    const DashboardController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/admin/dashboard.service', () => ({
      createDashboardService,
    }));
    jest.doMock('@backend/api/controllers/admin/dashboard.controller', () => ({
      DashboardController,
    }));

    let createDashboardRouter!: typeof import('@backend/api/routes/admin/dashboard.routes').createDashboardRouter;
    jest.isolateModules(() => {
      ({ createDashboardRouter } = require('@backend/api/routes/admin/dashboard.routes'));
    });

    const router = createDashboardRouter();

    expect(createDashboardService).toHaveBeenCalledTimes(1);
    expect(DashboardController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('wires the exam route factory with createExamService', () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'getExams',
      'getExamById',
      'getExamChallenge',
      'joinExam',
      'submitExam',
      'getLeaderboard',
      'getExamLeaderboard',
      'getMyParticipation',
      'getOrCreateSession',
      'getParticipationSubmission',
      'getParticipation',
      'syncSession',
      'createExam',
      'updateExam',
      'deleteExam',
    ]);
    const createExamService = jest.fn(() => serviceInstance);
    const ExamController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/exam.service', () => ({ createExamService }));
    jest.doMock('@backend/api/controllers/exam.controller', () => ({
      ExamController,
      CreateExamSchema: {},
    }));
    jest.doMock('@backend/shared/validations/exam.validation', () => ({
      JoinExamSchema: {},
      SubmitExamSchema: {},
      GetExamLeaderboardSchema: {},
      UpdateExamSchema: {},
    }));

    let createExamRouter!: typeof import('@backend/api/routes/exam.routes').createExamRouter;
    jest.isolateModules(() => {
      ({ createExamRouter } = require('@backend/api/routes/exam.routes'));
    });

    const router = createExamRouter();

    expect(createExamService).toHaveBeenCalledTimes(1);
    expect(ExamController).toHaveBeenCalledWith(serviceInstance);
    expect(typeof (router as Router).use).toBe('function');
  });

  it('keeps the admin-lesson parse-content path wired through LessonUploadController', async () => {
    mockRouteMiddlewareModules();
    const serviceInstance = {};
    const adminControllerInstance = createControllerDouble([
      'list',
      'getById',
      'create',
      'update',
      'remove',
    ]);
    const uploadControllerInstance = {
      parseContent: jest.fn((req: { body: { content: string } }, res: MockRouteResponse) => {
        res.status(200).json({ html: req.body.content });
      }),
    };
    const createAdminLessonService = jest.fn(() => serviceInstance);
    const AdminLessonController = jest.fn(() => adminControllerInstance);
    const LessonUploadController = jest.fn(() => uploadControllerInstance);

    jest.doMock('@backend/api/services/admin/adminLesson.service', () => ({
      createAdminLessonService,
    }));
    jest.doMock('@backend/api/controllers/admin/adminLesson.controller', () => ({
      __esModule: true,
      default: AdminLessonController,
    }));
    jest.doMock('@backend/api/controllers/lesson-upload.controller', () => ({
      __esModule: true,
      default: LessonUploadController,
    }));

    let createAdminLessonRouter!: typeof import('@backend/api/routes/admin/adminLesson.routes').createAdminLessonRouter;
    jest.isolateModules(() => {
      ({ createAdminLessonRouter } = require('@backend/api/routes/admin/adminLesson.routes'));
    });

    const app = express();
    app.use(express.json());
    app.use(createAdminLessonRouter());

    const response = await request(app).post('/parse-content').send({ content: '<p>Hello</p>' });

    expect(createAdminLessonService).toHaveBeenCalledTimes(1);
    expect(AdminLessonController).toHaveBeenCalledWith(serviceInstance);
    expect(LessonUploadController).toHaveBeenCalledTimes(1);
    expect(uploadControllerInstance.parseContent).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ html: '<p>Hello</p>' });
  });
});
