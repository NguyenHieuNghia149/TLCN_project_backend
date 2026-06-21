import { z } from 'zod';

export const CreateTopicSchema = z.object({
  topicName: z.string().min(1, 'Topic name is required.'),
});

export type CreateTopicInput = z.infer<typeof CreateTopicSchema>;

export const UpdateTopicSchema = z.object({
  topicName: z.string().min(1, 'Topic name is required.'),
});

export type UpdateTopicInput = z.infer<typeof UpdateTopicSchema>;

export const TopicResponseSchema = z.object({
  id: z.string(),
  topicName: z.string(),
});

export type TopicResponse = z.infer<typeof TopicResponseSchema>;
