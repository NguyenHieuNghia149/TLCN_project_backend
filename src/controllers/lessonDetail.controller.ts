import { Request, Response } from 'express';
import { LessonDetailService } from '@/services/lessonDetail.service';
import { AppException } from '@/exceptions/base.exception';

export class LessonDetailController {
  private lessonDetailService: LessonDetailService;

  constructor() {
    this.lessonDetailService = new LessonDetailService();
  }

  getLessonById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      throw new AppException('Lesson ID is required', 400, 'MISSING_ID');
    }

    const lesson = await this.lessonDetailService.getLessonById(id as string);

    res.status(200).json(lesson);
  };

  getLessonsByTopicId = async (req: Request, res: Response): Promise<void> => {
    const { topicId } = req.params;

    if (!topicId) {
      throw new AppException('Topic ID is required', 400, 'MISSING_TOPIC_ID');
    }

    const lessons = await this.lessonDetailService.getLessonsByTopicId(topicId as string);

    res.status(200).json(lessons);
  };

  getAllLessons = async (req: Request, res: Response): Promise<void> => {
    const lessons = await this.lessonDetailService.getAllLessons();

    res.status(200).json(lessons);
  };
}
