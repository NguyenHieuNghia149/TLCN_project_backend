import { Request, Response } from 'express';
import { createUserRoadmapSelectionService } from '@backend/api/services/user/userRoadmapSelection.service';
import { AppException } from '@backend/api/exceptions/base.exception';

class UserRoadmapSelectionController {
  private service = createUserRoadmapSelectionService();

  getUserSelection = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.userId as string | undefined;
    if (!userId) {
      throw new AppException('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const selection = await this.service.getUserRoadmapSelection(userId);
    res.status(200).json({
      success: true,
      data: selection,
    });
  };

  selectRoadmap = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.userId as string | undefined;
    if (!userId) {
      throw new AppException('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const roadmapId = (req.body as any)?.roadmapId;
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
  };
}

export default UserRoadmapSelectionController;
