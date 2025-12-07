import { Request, Response } from 'express';
import { AdminLessonService } from '@/services/admin/adminLesson.service';
import { CreateLessonSchema, UpdateLessonSchema } from '@/validations/lesson.validation';

export class AdminLessonController {
  private service: AdminLessonService;

  constructor() {
    this.service = new AdminLessonService();
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const sortBy = String(req.query.sortBy || 'createdAt');
    const sortOrder = (String(req.query.sortOrder || 'desc') as 'asc' | 'desc');

    const filters = {
      search: req.query.search ? String(req.query.search) : undefined,
      topicId: req.query.topicId ? String(req.query.topicId) : undefined,
      title: req.query.title ? String(req.query.title) : undefined,
    };

    try {
      const result = await this.service.listLessons(filters, {
        page,
        limit,
        sortBy,
        sortOrder,
      });

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const err = error as any;
      res.status(500).json({ 
        success: false, 
        message: err?.message || 'Failed to fetch lessons'
      });
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      const lesson = await this.service.getLessonById(id);
      res.status(200).json({ success: true, data: lesson });
    } catch (error) {
      const err = error as any;
      res.status(404).json({ success: false, message: err?.message || 'Lesson not found' });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const parse = CreateLessonSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({ success: false, message: parse.error.flatten() });
        return;
      }
      const lesson = await this.service.createLesson(parse.data);
      res.status(201).json({ success: true, data: lesson });
    } catch (error) {
      const err = error as any;
      res.status(500).json({ 
        success: false, 
        message: err?.message || 'Failed to create lesson'
      });
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      const parse = UpdateLessonSchema.partial().safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({ success: false, message: parse.error.flatten() });
        return;
      }
      const lesson = await this.service.updateLesson(id, parse.data);
      res.status(200).json({ success: true, data: lesson });
    } catch (error) {
      const err = error as any;
      res.status(500).json({ 
        success: false, 
        message: err?.message || 'Failed to update lesson'
      });
    }
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      await this.service.deleteLesson(id);
      res.status(204).send();
    } catch (error) {
      const err = error as any;
      res.status(500).json({ 
        success: false, 
        message: err?.message || 'Failed to delete lesson'
      });
    }
  };
}

export default AdminLessonController;
