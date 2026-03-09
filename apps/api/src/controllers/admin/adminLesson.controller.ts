import { Request, Response } from 'express';
import { AdminLessonService } from '@/services/admin/adminLesson.service';
import { CreateLessonSchema, UpdateLessonSchema } from '@/validations/lesson.validation';
import { AppException } from '@/exceptions/base.exception';

export class AdminLessonController {
  private service: AdminLessonService;

  constructor() {
    this.service = new AdminLessonService();
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const sortBy = String(req.query.sortBy || 'createdAt');
    const sortOrder = String(req.query.sortOrder || 'desc') as 'asc' | 'desc';

    const filters = {
      search: req.query.search ? String(req.query.search) : undefined,
      topicId: req.query.topicId ? String(req.query.topicId) : undefined,
      title: req.query.title ? String(req.query.title) : undefined,
    };

    const result = await this.service.listLessons(filters, {
      page,
      limit,
      sortBy,
      sortOrder,
    });

    res.status(200).json(result);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const lesson = await this.service.getLessonById(id);
    res.status(200).json(lesson);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const parse = CreateLessonSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppException('Validation error', 400, 'VALIDATION_ERROR', parse.error.flatten());
    }
    const lesson = await this.service.createLesson(parse.data);
    res.status(201).json(lesson);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const parse = UpdateLessonSchema.partial().safeParse(req.body);
    if (!parse.success) {
      throw new AppException('Validation error', 400, 'VALIDATION_ERROR', parse.error.flatten());
    }
    const lesson = await this.service.updateLesson(id, parse.data);
    res.status(200).json(lesson);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    await this.service.deleteLesson(id);
    res.status(204).send();
  };
}

export default AdminLessonController;
