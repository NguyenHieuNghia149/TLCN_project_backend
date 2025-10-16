import { Request, Response, NextFunction } from 'express';
import { TopicService } from '@/services/topic.service';
import { BaseException, ErrorHandler } from '@/exceptions/auth.exceptions';
import {
  CreateTopicInput,
  CreateTopicSchema,
  UpdateTopicInput,
} from '@/validations/topic.validation';

export class TopicController {
  constructor(private readonly topicService: TopicService) {}

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { topicName } = CreateTopicSchema.parse(req.body);
      const result = await this.topicService.createTopic({ topicName });
      res.status(201).json({ success: true, message: 'Topic created', data: result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const topicId = req.params.topicId;

      if (!topicId) {
        return res.status(400).json({ success: false, message: 'Topic ID is required' });
      }
      const result = await this.topicService.getTopicById(topicId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.topicService.getAllTopics();
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const { topicId } = req.params;
      if (!topicId) {
        return res.status(400).json({ success: false, message: 'Topic ID is required' });
      }
      const { topicName } = req.body;
      const result = await this.topicService.updateTopic(topicId, { topicName });
      res.status(200).json({ success: true, message: 'Topic updated', data: result });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const { topicId } = req.params;
      if (!topicId) {
        return res.status(400).json({ success: false, message: 'Topic ID is required' });
      }
      await this.topicService.deleteTopic(topicId);
      res.status(200).json({ success: true, message: 'Topic deleted' });
    } catch (error) {
      next(error);
    }
  }

  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    // Handle Postgres unique violation for topic name (index on LOWER(topic_name))
    const anyError = error as any;
    if (anyError && anyError.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Topic name already exists',
        code: 'DUPLICATE_TOPIC',
        timestamp: new Date().toISOString(),
      });
    }
    if (error instanceof BaseException) {
      const er = ErrorHandler.getErrorResponse(error);
      return res
        .status(er.statusCode)
        .json({ success: false, message: er.message, code: er.code, timestamp: er.timestamp });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
}
