import { Router } from 'express';
import { z } from 'zod';
import { validate } from '@/middlewares/validate.middleware';
import { authenticationToken, requireTeacherOrOwner } from '@/middlewares/auth.middleware';
import { AdminTopicController } from '@/controllers/admin/adminTopic.controller';
import { CreateTopicSchema, UpdateTopicSchema } from '@/validations/topic.validation';

const router = Router();
const controller = new AdminTopicController();

const idSchema = z.object({ id: z.string().uuid('Invalid topic ID') });

// CRUD routes
router.get('/', authenticationToken, requireTeacherOrOwner, controller.list);
router.get('/:id', authenticationToken, requireTeacherOrOwner, validate(idSchema, 'params'), controller.getById);
router.post('/', authenticationToken, requireTeacherOrOwner, validate(CreateTopicSchema), controller.create);
router.put('/:id', authenticationToken, requireTeacherOrOwner, validate(idSchema, 'params'), validate(UpdateTopicSchema.partial()), controller.update);
router.delete('/:id', authenticationToken, requireTeacherOrOwner, validate(idSchema, 'params'), controller.delete);
router.get('/:id/stats', authenticationToken, requireTeacherOrOwner, validate(idSchema, 'params'), controller.getStats);

export default router;
