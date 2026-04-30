import { z } from 'zod';

export const CreateRoadmapSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'private']).optional().default('public'),
});
export type CreateRoadmapInput = z.infer<typeof CreateRoadmapSchema>;

export const UpdateRoadmapSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'private']).optional(),
});
export type UpdateRoadmapInput = z.infer<typeof UpdateRoadmapSchema>;

export const AddRoadmapItemSchema = z.object({
  itemType: z.enum(['lesson', 'problem']),
  itemId: z.string().uuid(),
});
export type AddRoadmapItemInput = z.infer<typeof AddRoadmapItemSchema>;

export const ReorderRoadmapItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
});
export type ReorderRoadmapItemsInput = z.infer<typeof ReorderRoadmapItemsSchema>;

export const MarkRoadmapItemSchema = z.object({
  itemId: z.string().uuid(),
});
export type MarkRoadmapItemInput = z.infer<typeof MarkRoadmapItemSchema>;

export type RoadmapProgressStats = {
  total: number;
  completed: number;
  percentage: number;
  completedItems: string[];
};
