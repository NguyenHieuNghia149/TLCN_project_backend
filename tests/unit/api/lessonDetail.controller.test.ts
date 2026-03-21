import { LessonDetailController } from '@backend/api/controllers/lessonDetail.controller';
import { createMockResponse } from './controller-test-helpers';

describe('LessonDetailController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the injected lesson detail service to load a lesson by id', async () => {
    const lesson = { id: 'lesson-1', title: 'Arrays' };
    const lessonDetailService = {
      getLessonById: jest.fn().mockResolvedValue(lesson),
    } as any;
    const controller = new LessonDetailController(lessonDetailService);
    const response = createMockResponse();

    await controller.getLessonById({ params: { id: 'lesson-1' } } as any, response as any);

    expect(lessonDetailService.getLessonById).toHaveBeenCalledWith('lesson-1');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(lesson);
  });
});
