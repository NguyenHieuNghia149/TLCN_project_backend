import { Request, Response } from 'express';

export class LessonUploadController {
  /**
   * Parse content - nhận HTML từ frontend (đã được xử lý)
   * Dùng khi user paste content trực tiếp hoặc frontend gửi HTML từ file Word
   */
  parseContent = async (req: Request, res: Response): Promise<void> => {
    try {
      const { content } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({ success: false, message: 'Content is required' });
        return;
      }

      // Return original content (frontend processed Word->HTML)
      res.status(200).json({
        success: true,
        data: {
          html: content,
        },
      });
    } catch (error) {
      const err = error as any;
      res.status(500).json({
        success: false,
        message: err?.message || 'Failed to parse content',
      });
    }
  };
}

export default LessonUploadController;
