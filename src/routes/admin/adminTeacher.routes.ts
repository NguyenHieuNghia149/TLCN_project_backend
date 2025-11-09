import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware';
import { authenticationToken, requireOwner } from '@/middlewares/auth.middleware';
import AdminTeacherController from '@/controllers/admin/adminTeacher.controller';
import { z } from 'zod';

const router = Router();
const controller = new AdminTeacherController();

const idSchema = z.object({ id: z.string().uuid('Invalid user ID') });

router.get('/', authenticationToken, requireOwner, controller.list);
router.post('/', authenticationToken, requireOwner, controller.create);
router.put('/:id', authenticationToken, requireOwner, validate(idSchema, 'params'), controller.update);

export default router;


