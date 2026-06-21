import {
  LearningProcessService,
  createLearningProcessService,
} from '@backend/api/services/learningprocess.service';
import { LearningProcessRepository } from '@backend/api/repositories/learningprocess.repository';

describe('LearningProcessService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses the injected repository to load user progress', async () => {
    const progress = { recentTopic: null, recentLesson: null };
    const learningProcessRepository = {
      getUserLearningProgress: jest.fn().mockResolvedValue(progress),
    } as any;
    const service = new LearningProcessService({ learningProcessRepository });

    const result = await service.getUserLearningProgress('user-1');

    expect(learningProcessRepository.getUserLearningProgress).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(progress);
  });

  it('creates a service wired with a concrete learning process repository', () => {
    const service = createLearningProcessService();

    expect(service).toBeInstanceOf(LearningProcessService);
    expect((service as any).learningProcessRepository).toBeInstanceOf(LearningProcessRepository);
  });
});
