import { z } from 'zod';
import { ENotificationType } from '@/enums/notificationType.enum';

export const CreateNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.nativeEnum(ENotificationType),
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const NotificationMetadataSchemas = {
  [ENotificationType.NEW_EXAM]: z.object({
    examId: z.string().uuid(),
    link: z.string(),
  }),
  [ENotificationType.SYSTEM]: z.object({}).optional(),
  [ENotificationType.SUBMISSION]: z
    .object({
      submissionId: z.string(),
      problemId: z.string(),
    })
    .optional(),
  [ENotificationType.COMMENT]: z
    .object({
      commentId: z.string(),
      postId: z.string().optional(),
      parentId: z.string().optional(),
    })
    .optional(),
  // Add other types as needed
};

export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;
