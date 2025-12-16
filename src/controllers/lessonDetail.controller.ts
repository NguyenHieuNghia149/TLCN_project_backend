import { Request, Response } from 'express';
import { LessonDetailService } from '@/services/lessonDetail.service';
import { LessonDetailNotFoundError } from '@/exceptions/lesson.exceptions';

export class LessonDetailController {
  private lessonDetailService: LessonDetailService;

  constructor() {
    this.lessonDetailService = new LessonDetailService();
  }

  getLessonById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Lesson ID is required',
        });
        return;
      }

      const lesson = await this.lessonDetailService.getLessonById(id);

      res.status(200).json({
        success: true,
        data: lesson,
        message: 'Lesson retrieved successfully',
      });
    } catch (error) {
      if (error instanceof LessonDetailNotFoundError) {
        res.status(404).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getLessonsByTopicId = async (req: Request, res: Response): Promise<void> => {
    try {
      const { topicId } = req.params;

      if (!topicId) {
        res.status(400).json({
          success: false,
          message: 'Topic ID is required',
        });
        return;
      }

      const lessons = await this.lessonDetailService.getLessonsByTopicId(topicId);

      res.status(200).json({
        success: true,
        data: lessons,
        message: 'Lessons retrieved successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getAllLessons = async (req: Request, res: Response): Promise<void> => {
    try {
      const lessons = await this.lessonDetailService.getAllLessons();

      res.status(200).json({
        success: true,
        data: lessons,
        message: 'All lessons retrieved successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}
