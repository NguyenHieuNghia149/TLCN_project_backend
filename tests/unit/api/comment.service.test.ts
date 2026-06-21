import { CommentService, createCommentService } from '@backend/api/services/comment.service';
import { CommentRepository } from '@backend/api/repositories/comment.repository';

describe('CommentService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses the injected repository to fetch lesson comments', async () => {
    const comments = [{ id: 'comment-1' }];
    const commentRepository = {
      listByLesson: jest.fn().mockResolvedValue(comments),
    } as any;
    const service = new CommentService({ commentRepository });

    const result = await service.getCommentsByLesson('lesson-1');

    expect(commentRepository.listByLesson).toHaveBeenCalledWith('lesson-1');
    expect(result).toEqual(comments);
  });

  it('creates a service wired with a concrete comment repository', () => {
    const service = createCommentService();

    expect(service).toBeInstanceOf(CommentService);
    expect((service as any).repo).toBeInstanceOf(CommentRepository);
  });
});
