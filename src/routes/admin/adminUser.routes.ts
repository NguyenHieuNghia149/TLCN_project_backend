import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware';
import { authenticationToken, requireTeacherOrOwner } from '@/middlewares/auth.middleware';
import AdminUserController from '@/controllers/admin/adminUser.controller';
import { z } from 'zod';

const router = Router();
const controller = new AdminUserController();

const idSchema = z.object({ id: z.string().uuid('Invalid user ID') });

router.get('/', authenticationToken, requireTeacherOrOwner, controller.list);
router.get('/teachers', authenticationToken, requireTeacherOrOwner, controller.listTeachers);
router.get('/:id', authenticationToken, requireTeacherOrOwner, validate(idSchema, 'params'), controller.getById);
router.post('/', authenticationToken, requireTeacherOrOwner, controller.create);
router.put('/:id', authenticationToken, requireTeacherOrOwner, validate(idSchema, 'params'), controller.update);
router.delete('/:id', authenticationToken, requireTeacherOrOwner, validate(idSchema, 'params'), controller.remove);

export default router;


