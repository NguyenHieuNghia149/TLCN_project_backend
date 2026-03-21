import {
  LearnedLessonService,
  createLearnedLessonService,
} from '@backend/api/services/learned-lesson.service';
import { LearnedLessonRepository } from '@backend/api/repositories/learned-lesson.repository';

describe('LearnedLessonService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses the injected repository to check lesson completion', async () => {
    const learnedLessonRepository = {
      hasUserCompletedLesson: jest.fn().mockResolvedValue(true),
    } as any;
    const service = new LearnedLessonService({ learnedLessonRepository });

    const result = await service.hasUserCompletedLesson('user-1', 'lesson-1');

    expect(learnedLessonRepository.hasUserCompletedLesson).toHaveBeenCalledWith(
      'user-1',
      'lesson-1',
    );
    expect(result).toBe(true);
  });

  it('creates a service wired with a concrete learned-lesson repository', () => {
    const service = createLearnedLessonService();

    expect(service).toBeInstanceOf(LearnedLessonService);
    expect((service as any).learnedLessonRepository).toBeInstanceOf(LearnedLessonRepository);
  });
});
