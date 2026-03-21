import { LearnedLessonController } from '@backend/api/controllers/learned-lesson.controller';
import { createMockResponse } from './controller-test-helpers';

describe('LearnedLessonController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the injected learned lesson service to check completion', async () => {
    const learnedLessonService = {
      hasUserCompletedLesson: jest.fn().mockResolvedValue(true),
    } as any;
    const controller = new LearnedLessonController(learnedLessonService);
    const response = createMockResponse();

    await controller.checkLessonCompletion(
      { user: { userId: 'user-1' }, params: { lessonId: 'lesson-1' } } as any,
      response as any,
      jest.fn(),
    );

    expect(learnedLessonService.hasUserCompletedLesson).toHaveBeenCalledWith(
      'user-1',
      'lesson-1',
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ isCompleted: true });
  });
});
