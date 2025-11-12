import { Request, Response } from 'express';
import { AdminUserService } from '@/services/admin/adminUser.service';
import { insertUserSchema, updateUserSchema } from '@/database/schema';

export class AdminTeacherController {
  private service: AdminUserService;

  constructor() {
    this.service = new AdminUserService();
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const sortBy = String(req.query.sortBy || 'createdAt');
    const sortOrder = (String(req.query.sortOrder || 'desc') as 'asc' | 'desc');
    const result = await this.service.listTeachers({ page, limit, sortBy, sortOrder });
    res.status(200).json({ success: true, data: result });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const body = {
      ...req.body,
      role: 'teacher',
      dateOfBirth: req.body?.dateOfBirth ? new Date(req.body.dateOfBirth) : undefined,
    };
    const parse = insertUserSchema.safeParse(body);
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.flatten() });
      return;
    }
    const user = await this.service.createUser(parse.data);
    res.status(201).json({ success: true, data: user });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    // Force keep role as teacher if present
    const body = {
      ...req.body,
      role: 'teacher',
      dateOfBirth: req.body?.dateOfBirth ? new Date(req.body.dateOfBirth) : undefined,
    };
    const parse = updateUserSchema.safeParse(body);
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.flatten() });
      return;
    }
    const user = await this.service.updateUser(id, parse.data);
    res.status(200).json({ success: true, data: user });
  };
}

export default AdminTeacherController;


