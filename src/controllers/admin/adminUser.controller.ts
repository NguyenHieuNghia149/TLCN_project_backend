import { Request, Response } from 'express';
import { AdminUserService } from '@/services/admin/adminUser.service';
import { insertUserSchema, updateUserSchema } from '@/database/schema';

export class AdminUserController {
  private service: AdminUserService;

  constructor() {
    this.service = new AdminUserService();
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const sortBy = String(req.query.sortBy || 'createdAt');
    const sortOrder = (String(req.query.sortOrder || 'desc') as 'asc' | 'desc');

    const filters = {
      search: req.query.search ? String(req.query.search) : undefined,
      role: req.query.role ? String(req.query.role) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      email: req.query.email ? String(req.query.email) : undefined,
      firstName: req.query.firstName ? String(req.query.firstName) : undefined,
      lastName: req.query.lastName ? String(req.query.lastName) : undefined,
    };

    const result = await this.service.listUsers({
      filters,
      pagination: { page, limit, sortBy, sortOrder },
    });

    res.status(200).json({ success: true, data: result });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const user = await this.service.getUser(id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.status(200).json({ success: true, data: user });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const body = {
      ...req.body,
      // Accept ISO string from client and convert to Date for validation
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
    const body = {
      ...req.body,
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

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    await this.service.deleteUser(id);
    res.status(204).send();
  };

  listTeachers = async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const sortBy = String(req.query.sortBy || 'createdAt');
    const sortOrder = (String(req.query.sortOrder || 'desc') as 'asc' | 'desc');

    const result = await this.service.listTeachers({ page, limit, sortBy, sortOrder });
    res.status(200).json({ success: true, data: result });
  };
}

export default AdminUserController;


