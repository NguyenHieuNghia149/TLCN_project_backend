import { Request, Response } from 'express';
import { createUserRoadmapSelectionService } from '@backend/api/services/user/userRoadmapSelection.service';
import { AppException } from '@backend/api/exceptions/base.exception';

class UserRoadmapSelectionController {
  private service = createUserRoadmapSelectionService();

  async getUserSelection(req: Request, res: Response): Promise<void> {
    const userId = (req as unknown as { user?: { userId: string } }).user?.userId;
    if (!userId) {
      throw new AppException('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const selection = await this.service.getUserRoadmapSelection(userId);
    res.status(200).json({
      success: true,
      data: selection,
    });
  }

  async selectRoadmap(req: Request, res: Response): Promise<void> {
    const userId = (req as unknown as { user?: { userId: string } }).user?.userId;
    if (!userId) {
      throw new AppException('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const roadmapId = (req.body as { roadmapId?: string })?.roadmapId;
    if (!roadmapId) {
      throw new AppException('roadmapId is required', 400, 'INVALID_INPUT');
    }

    const selection = await this.service.selectRoadmap({
      userId,
      roadmapId,
    });

    res.status(200).json({
      success: true,
      data: selection,
    });
  }
}

export default UserRoadmapSelectionController;
