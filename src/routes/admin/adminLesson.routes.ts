import { Router } from 'express';
import { z } from 'zod';
import { validate } from '@/middlewares/validate.middleware';
import { authenticationToken, requireTeacherOrOwner } from '@/middlewares/auth.middleware';
import AdminLessonController from '@/controllers/admin/adminLesson.controller';
import LessonUploadController from '@/controllers/lesson-upload.controller';
import { CreateLessonSchema, UpdateLessonSchema } from '@/validations/lesson.validation';

const router = Router();
const controller = new AdminLessonController();
const uploadController = new LessonUploadController();

const idSchema = z.object({ id: z.string().uuid('Invalid lesson ID') });

// Frontend đã xử lý Word→HTML, chỉ nhận HTML qua parse-content endpoint
router.post('/parse-content', authenticationToken, requireTeacherOrOwner, validate(z.object({ content: z.string() })), uploadController.parseContent)

// CRUD routes
router.get('/', authenticationToken, requireTeacherOrOwner, controller.list);
router.get('/:id', authenticationToken, requireTeacherOrOwner, validate(idSchema, 'params'), controller.getById);
router.post('/', authenticationToken, requireTeacherOrOwner, validate(CreateLessonSchema), controller.create);
router.put('/:id', authenticationToken, requireTeacherOrOwner, validate(idSchema, 'params'), validate(UpdateLessonSchema.partial()), controller.update);
router.delete('/:id', authenticationToken, requireTeacherOrOwner, validate(idSchema, 'params'), controller.remove);

export default router;
