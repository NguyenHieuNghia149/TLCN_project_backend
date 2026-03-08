import { Request, Response } from 'express';
import { AdminTopicService } from '@/services/admin/adminTopic.service';
import { CreateTopicSchema, UpdateTopicSchema } from '@/validations/topic.validation';
import { AppException } from '@/exceptions/base.exception';

export class AdminTopicController {
  private service: AdminTopicService;

  constructor() {
    this.service = new AdminTopicService();
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const sortBy = String(req.query.sortBy || 'createdAt');
    const sortOrder = String(req.query.sortOrder || 'desc') as 'asc' | 'desc';

    const filters = {
      search: req.query.search ? String(req.query.search) : undefined,
      topicName: req.query.topicName ? String(req.query.topicName) : undefined,
    };

    const result = await this.service.listTopics(filters, {
      page,
      limit,
      sortBy,
      sortOrder,
    });

    res.status(200).json(result);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const topic = await this.service.getTopicById(id);
    res.status(200).json(topic);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const parse = CreateTopicSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppException('Validation error', 400, 'VALIDATION_ERROR', parse.error.flatten());
    }
    const topic = await this.service.createTopic(parse.data);
    res.status(201).json(topic);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const parse = UpdateTopicSchema.partial().safeParse(req.body);
    if (!parse.success) {
      throw new AppException('Validation error', 400, 'VALIDATION_ERROR', parse.error.flatten());
    }
    const topic = await this.service.updateTopic(id, parse.data);
    res.status(200).json(topic);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    await this.service.deleteTopic(id);
    res.status(200).json({ message: 'Topic deleted successfully' });
  };

  getStats = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const stats = await this.service.getTopicStats(id);
    res.status(200).json(stats);
  };
}
