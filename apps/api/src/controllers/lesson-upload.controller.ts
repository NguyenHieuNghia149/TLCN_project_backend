import { Request, Response } from 'express';
import { AppException } from '@/exceptions/base.exception';

export class LessonUploadController {
  /**
   * Parse content - nhận HTML từ frontend (đã được xử lý)
   * Dùng khi user paste content trực tiếp hoặc frontend gửi HTML từ file Word
   */
  parseContent = async (req: Request, res: Response): Promise<void> => {
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      throw new AppException('Content is required', 400, 'INVALID_INPUT');
    }

    // Return original content (frontend processed Word->HTML)
    res.status(200).json({
      html: content,
    });
  };
}

export default LessonUploadController;
