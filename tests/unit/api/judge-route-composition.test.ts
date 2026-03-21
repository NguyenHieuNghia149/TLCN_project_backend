import type { RequestHandler } from 'express';

/** Creates a pass-through middleware used to isolate judge route factory tests. */
function createPassThroughMiddleware(): RequestHandler {
  return (req, res, next) => next();
}

/** Mocks middleware modules so judge route tests focus on factory wiring only. */
function mockJudgeRouteMiddlewareModules(): void {
  const passThroughMiddleware = createPassThroughMiddleware();

  jest.doMock('@backend/api/middlewares/auth.middleware', () => ({
    authenticationToken: passThroughMiddleware,
    optionalAuth: passThroughMiddleware,
    requireTeacher: passThroughMiddleware,
    requireTeacherOrOwner: passThroughMiddleware,
  }));
  jest.doMock('@backend/api/middlewares/validate.middleware', () => ({
    validate: jest.fn(() => passThroughMiddleware),
  }));
  jest.doMock('@backend/api/middlewares/ratelimit.middleware', () => ({
    rateLimitMiddleware: jest.fn(() => passThroughMiddleware),
  }));
}

/** Builds a controller double that exposes the handler names required by a route factory. */
function createControllerDouble(methodNames: string[]): Record<string, jest.Mock> {
  return Object.fromEntries(
    methodNames.map(methodName => [
      methodName,
      jest.fn((req: unknown, res: { status: (code: number) => { json: (body: unknown) => unknown } }) =>
        res.status(200).json({ methodName }),
      ),
    ]),
  );
}

describe('Judge route composition', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('wires the challenge route factory with createChallengeService', () => {
    mockJudgeRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'listProblemsByTopic',
      'getAllTags',
      'getTopicTags',
      'listProblemsByTopicAndTags',
      'createChallenge',
      'getAllChallenges',
      'getChallengeById',
      'updateChallenge',
      'deleteChallenge',
      'updateSolutionVisibility',
    ]);
    const createChallengeService = jest.fn(() => serviceInstance);
    const ChallengeController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/challenge.service', () => ({ createChallengeService }));
    jest.doMock('@backend/api/controllers/challenge.controller', () => ({ ChallengeController }));

    let createChallengeRouter!: typeof import('@backend/api/routes/challenge.routes').createChallengeRouter;
    jest.isolateModules(() => {
      ({ createChallengeRouter } = require('@backend/api/routes/challenge.routes'));
    });

    createChallengeRouter();

    expect(createChallengeService).toHaveBeenCalledTimes(1);
    expect(ChallengeController).toHaveBeenCalledWith(serviceInstance);
  });

  it('wires the favorite route factory with createFavoriteService', () => {
    mockJudgeRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'listLessonFavorites',
      'addLessonFavorite',
      'removeLessonFavorite',
      'toggleLessonFavorite',
      'listFavorites',
      'addFavorite',
      'removeFavorite',
      'toggleFavorite',
    ]);
    const createFavoriteService = jest.fn(() => serviceInstance);
    const FavoriteController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/favorite.service', () => ({ createFavoriteService }));
    jest.doMock('@backend/api/controllers/favorite.controller', () => ({ FavoriteController }));

    let createFavoriteRouter!: typeof import('@backend/api/routes/favorite.routes').createFavoriteRouter;
    jest.isolateModules(() => {
      ({ createFavoriteRouter } = require('@backend/api/routes/favorite.routes'));
    });

    createFavoriteRouter();

    expect(createFavoriteService).toHaveBeenCalledTimes(1);
    expect(FavoriteController).toHaveBeenCalledWith(serviceInstance);
  });

  it('wires the submission route factory with createSubmissionService and getSseService', () => {
    mockJudgeRouteMiddlewareModules();
    const serviceInstance = {};
    const controllerInstance = createControllerDouble([
      'getQueueStatus',
      'createSubmission',
      'streamSubmissionStatus',
      'getSubmissionStatus',
      'getSubmissionResults',
      'getUserSubmissions',
      'getProblemSubmissions',
      'getProblemSubmissionsByUser',
      'runCode',
    ]);
    const createSubmissionService = jest.fn(() => serviceInstance);
    const getSseService = jest.fn();
    const SubmissionController = jest.fn(() => controllerInstance);

    jest.doMock('@backend/api/services/submission.service', () => ({ createSubmissionService }));
    jest.doMock('@backend/api/services/sse.service', () => ({ getSseService }));
    jest.doMock('@backend/api/controllers/submission.controller', () => ({ SubmissionController }));

    let createSubmissionRouter!: typeof import('@backend/api/routes/submission.routes').createSubmissionRouter;
    jest.isolateModules(() => {
      ({ createSubmissionRouter } = require('@backend/api/routes/submission.routes'));
    });

    createSubmissionRouter();

    expect(createSubmissionService).toHaveBeenCalledTimes(1);
    expect(SubmissionController).toHaveBeenCalledWith(serviceInstance, getSseService);
  });
});
