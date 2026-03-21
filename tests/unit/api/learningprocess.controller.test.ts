import { LearningProcessController } from '@backend/api/controllers/learningprocess.controller';
import { createMockResponse } from './controller-test-helpers';

describe('LearningProcessController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the injected learning process service to load user progress', async () => {
    const progress = { topicsCompleted: 3 };
    const learningProcessService = {
      getUserLearningProgress: jest.fn().mockResolvedValue(progress),
    } as any;
    const controller = new LearningProcessController(learningProcessService);
    const response = createMockResponse();

    await controller.getUserProgress(
      { user: { userId: 'user-1' } } as any,
      response as any,
      jest.fn(),
    );

    expect(learningProcessService.getUserLearningProgress).toHaveBeenCalledWith('user-1');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(progress);
  });
});
