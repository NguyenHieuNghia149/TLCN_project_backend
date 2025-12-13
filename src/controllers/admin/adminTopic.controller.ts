import { Request, Response } from 'express';
import { AdminTopicService } from '@/services/admin/adminTopic.service';
import { CreateTopicSchema, UpdateTopicSchema } from '@/validations/topic.validation';

export class AdminTopicController {
  private service: AdminTopicService;

  constructor() {
    this.service = new AdminTopicService();
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const sortBy = String(req.query.sortBy || 'createdAt');
    const sortOrder = (String(req.query.sortOrder || 'desc') as 'asc' | 'desc');

    const filters = {
      search: req.query.search ? String(req.query.search) : undefined,
      topicName: req.query.topicName ? String(req.query.topicName) : undefined,
    };

    try {
      const result = await this.service.listTopics(filters, {
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
        message: err?.message || 'Failed to fetch topics',
      });
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      const topic = await this.service.getTopicById(id);
      res.status(200).json({ success: true, data: topic });
    } catch (error) {
      const err = error as any;
      res.status(404).json({ success: false, message: err?.message || 'Topic not found' });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const parse = CreateTopicSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({ success: false, message: parse.error.flatten() });
        return;
      }
      const topic = await this.service.createTopic(parse.data);
      res.status(201).json({ success: true, data: topic });
    } catch (error) {
      const err = error as any;
      res.status(500).json({
        success: false,
        message: err?.message || 'Failed to create topic',
      });
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      const parse = UpdateTopicSchema.partial().safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({ success: false, message: parse.error.flatten() });
        return;
      }
      const topic = await this.service.updateTopic(id, parse.data);
      res.status(200).json({ success: true, data: topic });
    } catch (error) {
      const err = error as any;
      res.status(500).json({
        success: false,
        message: err?.message || 'Failed to update topic',
      });
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      await this.service.deleteTopic(id);
      res.status(200).json({ success: true, message: 'Topic deleted successfully' });
    } catch (error) {
      const err = error as any;
      res.status(500).json({
        success: false,
        message: err?.message || 'Failed to delete topic',
      });
    }
  };

  getStats = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      const stats = await this.service.getTopicStats(id);
      res.status(200).json({ success: true, data: stats });
    } catch (error) {
      const err = error as any;
      res.status(500).json({
        success: false,
        message: err?.message || 'Failed to fetch topic stats',
      });
    }
  };
}
