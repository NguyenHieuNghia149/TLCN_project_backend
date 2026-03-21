import { CommentController } from '@backend/api/controllers/comment.controller';
import { createMockResponse } from './controller-test-helpers';

describe('CommentController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the injected comment service to fetch lesson comments', async () => {
    const comments = [{ id: 'comment-1' }];
    const commentService = {
      getCommentsByLesson: jest.fn().mockResolvedValue(comments),
    } as any;
    const controller = new CommentController(commentService);
    const response = createMockResponse();

    await controller.getByLesson(
      { params: { lessonId: 'lesson-1' } } as any,
      response as any,
      jest.fn(),
    );

    expect(commentService.getCommentsByLesson).toHaveBeenCalledWith('lesson-1');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(comments);
  });
});
