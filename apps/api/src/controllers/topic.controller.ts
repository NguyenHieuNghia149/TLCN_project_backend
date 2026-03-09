import { Request, Response, NextFunction } from 'express';
import { TopicService } from '@/services/topic.service';
import { AppException } from '@/exceptions/base.exception';
import { CreateTopicSchema } from '@backend/shared/validations/topic.validation';

export class TopicController {
  constructor(private readonly topicService: TopicService) {}

  async create(req: Request, res: Response, next: NextFunction) {
    const { topicName } = CreateTopicSchema.parse(req.body);
    const topic = await this.topicService.getTopicByName(topicName);
    if (topic) {
      throw new AppException('Topic name already exists', 409, 'DUPLICATE_TOPIC');
    }
    const result = await this.topicService.createTopic({ topicName });
    res.status(201).json({ message: 'Topic created', ...result });
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const topicId = req.params.topicId;

    if (!topicId) {
      throw new AppException('Topic ID is required', 400, 'MISSING_TOPIC_ID');
    }
    const result = await this.topicService.getTopicById(topicId as string);
    res.status(200).json(result);
  }

  async list(req: Request, res: Response, next: NextFunction) {
    const result = await this.topicService.getAllTopics();
    res.status(200).json(result);
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { topicId } = req.params;
    if (!topicId) {
      throw new AppException('Topic ID is required', 400, 'MISSING_TOPIC_ID');
    }
    const { topicName } = req.body;
    const result = await this.topicService.updateTopic(topicId as string, { topicName });
    res.status(200).json({ message: 'Topic updated', ...result });
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { topicId } = req.params;
    if (!topicId) {
      throw new AppException('Topic ID is required', 400, 'MISSING_TOPIC_ID');
    }
    await this.topicService.deleteTopic(topicId as string);
    res.status(200).json({ message: 'Topic deleted' });
  }
}
