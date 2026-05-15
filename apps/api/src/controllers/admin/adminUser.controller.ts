import { Request, Response } from 'express';
import { AdminUserService } from '@backend/api/services/admin/adminUser.service';
import { insertUserSchema, updateUserSchema } from '@backend/shared/db/schema';
import { z } from 'zod';

export class AdminUserController {
  constructor(private readonly service: AdminUserService) {}

  // UUID validation helper
  private validateUUID(value: any): boolean {
    if (!value || typeof value !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const sortBy = String(req.query.sortBy || 'createdAt');
    const sortOrder = String(req.query.sortOrder || 'desc') as 'asc' | 'desc';

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
    const sortOrder = String(req.query.sortOrder || 'desc') as 'asc' | 'desc';

    const result = await this.service.listTeachers({ page, limit, sortBy, sortOrder });
    res.status(200).json({ success: true, data: result });
  };

  // --- Ban/Unban Methods ---

  banUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      // Validate UUID
      if (!this.validateUUID(id)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_UUID', message: 'Invalid user ID format' },
        });
        return;
      }

      // Validate request body
      const banDtoSchema = z.object({
        reason: z
          .string()
          .min(10, 'Ban reason must be at least 10 characters')
          .max(500, 'Ban reason cannot exceed 500 characters'),
      });

      const parseResult = banDtoSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parseResult.error.flatten() },
        });
        return;
      }

      // Get admin info from request
      const adminId = (req as any).user?.userId;
      const adminRole = (req as any).user?.role;

      if (!adminId || !adminRole) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Admin authentication required' },
        });
        return;
      }

      // Call service
      const result = await this.service.banUser(id, adminId, adminRole, parseResult.data.reason);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.name === 'ForbiddenException') {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
      } else if (error.name === 'NotFoundException') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
      } else if (error.name === 'BadRequestException') {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: error.message },
        });
      } else {
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to ban user' },
        });
      }
    }
  };

  unbanUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      // Validate UUID
      if (!this.validateUUID(id)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_UUID', message: 'Invalid user ID format' },
        });
        return;
      }

      // Get admin info from request
      const adminId = (req as any).user?.userId;
      const adminRole = (req as any).user?.role;

      if (!adminId || !adminRole) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Admin authentication required' },
        });
        return;
      }

      // Call service
      const result = await this.service.unbanUser(id, adminId, adminRole);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.name === 'ForbiddenException') {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
      } else if (error.name === 'NotFoundException') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
      } else if (error.name === 'BadRequestException') {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: error.message },
        });
      } else {
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to unban user' },
        });
      }
    }
  };

  listBannedUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20);
      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

      // Get admin info from request
      const adminRole = (req as any).user?.role;

      if (!adminRole) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Admin authentication required' },
        });
        return;
      }

      // Call service
      const result = await this.service.listBannedUsers(limit, offset, adminRole);

      res.status(200).json({
        success: true,
        data: {
          users: result.users,
          pagination: {
            limit,
            offset,
            total: result.total,
          },
        },
      });
    } catch (error: any) {
      if (error.name === 'ForbiddenException') {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
      } else {
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch banned users' },
        });
      }
    }
  };
}

export default AdminUserController;
