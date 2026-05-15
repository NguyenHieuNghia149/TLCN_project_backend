import { Request, Response } from 'express';
import { AdminRoadmapService } from '@backend/api/services/admin/adminRoadmap.service';

export class AdminRoadmapController {
  constructor(private readonly service: AdminRoadmapService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const limit = Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20);
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

    const result = await this.service.listRoadmaps({
      limit,
      offset,
      keyword: req.query.keyword ? String(req.query.keyword) : undefined,
      createdBy: req.query.createdBy ? String(req.query.createdBy) : undefined,
      visibility: req.query.visibility ? (String(req.query.visibility) as 'public' | 'private') : undefined,
      createdAtFrom: req.query.createdAtFrom ? String(req.query.createdAtFrom) : undefined,
      createdAtTo: req.query.createdAtTo ? String(req.query.createdAtTo) : undefined,
    });

    res.status(200).json({ success: true, data: result, error: null });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.userId as string | undefined;
    if (!userId) {
      res.status(401).json({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    const { title, description, visibility } = req.body as {
      title: string;
      description?: string;
      visibility?: 'public' | 'private';
    };

    const roadmap = await this.service.createRoadmap({
      title,
      description,
      visibility: visibility || 'public',
      createdBy: userId,
    });

    res.status(201).json({ success: true, data: roadmap, error: null });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const result = await this.service.getRoadmapDetail(id);
    res.status(200).json({ success: true, data: result, error: null });
  };

  updateVisibility = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const adminId = (req as any).user?.userId as string | undefined;

    // [WARN-2] Throw instead of falling back to 'unknown'
    if (!adminId) {
      res.status(401).json({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    const { visibility } = req.body as { visibility: 'public' | 'private' };

    const result = await this.service.updateVisibility({ id, visibility, adminId });
    res.status(200).json({ success: true, data: result, error: null });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const adminId = (req as any).user?.userId as string | undefined;

    // [WARN-2] Throw instead of falling back to 'unknown'
    if (!adminId) {
      res.status(401).json({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    const result = await this.service.deleteRoadmap({ id, adminId });
    res.status(200).json({ success: true, data: result, error: null });
  };

  addItem = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const { itemType, itemId, order } = req.body as {
      itemType: 'lesson' | 'problem';
      itemId: string;
      order?: number;
    };

    const item = await this.service.addItemToRoadmap({
      roadmapId: id,
      itemType,
      itemId,
      order,
    });

    res.status(201).json({ success: true, data: item, error: null });
  };

  removeItem = async (req: Request, res: Response): Promise<void> => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    const result = await this.service.removeItemFromRoadmap({
      roadmapId: id,
      itemId,
    });

    res.status(200).json({ success: true, data: result, error: null });
  };

  reorderItems = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const { itemIds } = req.body as { itemIds: string[] };
    const adminId = (req as any).user?.userId as string | undefined;

    if (!adminId) {
      res.status(401).json({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    const result = await this.service.reorderItems(id, adminId, itemIds);
    res.status(200).json({ success: true, data: result, error: null });
  };

  // [BUG-2] Delegate to service; [BUG-3] No try/catch – let global error handler format the response
  getAvailableItems = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getAvailableItems();
    res.status(200).json({ success: true, data, error: null });
  };
}

export default AdminRoadmapController;
