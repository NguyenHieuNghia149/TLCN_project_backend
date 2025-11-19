import { CommentRepository, CommentWithUser } from '@/repositories/comment.repository';
import { CommentInsert, CommentEntity } from '@/database/schema';

export class CommentService {
  private repo: CommentRepository;

  constructor() {
    this.repo = new CommentRepository();
  }

  async createComment(payload: CommentInsert): Promise<CommentEntity> {
    const created = await this.repo.create(payload as CommentInsert);
    return created;
  }

  async getCommentsByLesson(lessonId: string): Promise<CommentWithUser[]> {
    return this.repo.listByLesson(lessonId);
  }

  async getCommentsByProblem(problemId: string): Promise<CommentWithUser[]> {
    return this.repo.listByProblem(problemId);
  }

  async updateComment(id: string, content: string, userId?: string): Promise<CommentEntity | null> {
    // Ensure only author can update
    const comment = await this.repo.findById(id);
    if (!comment) return null;
    if (userId && comment.userId !== userId) {
      throw new Error('Permission denied');
    }
    return this.repo.update(id, { content } as any);
  }

  async deleteComment(id: string, userId?: string, userRole?: string): Promise<boolean> {
    // Allow deletion if:
    // 1. User is the author of the comment
    // 2. User is an owner or teacher
    const comment = await this.repo.findById(id);
    if (!comment) return false;
    
    const isAuthor = userId && comment.userId === userId;
    const isAdmin = userRole && (userRole === 'owner' || userRole === 'teacher');
    
    if (!isAuthor && !isAdmin) {
      throw new Error('Permission denied');
    }
    
    return this.repo.delete(id);
  }
}
