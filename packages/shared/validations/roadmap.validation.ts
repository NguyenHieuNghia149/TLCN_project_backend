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
  order: z.number().int().optional(),
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

export const ListRoadmapsQuerySchema = z.object({
  keyword: z.string().optional(),
  createdBy: z.string().uuid().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  createdAtFrom: z.string().optional(),
  createdAtTo: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});
export type ListRoadmapsQueryInput = z.infer<typeof ListRoadmapsQuerySchema>;

export const UpdateVisibilitySchema = z.object({
  visibility: z.enum(['public', 'private']),
});
export type UpdateVisibilityInput = z.infer<typeof UpdateVisibilitySchema>;

export const RoadmapIdParamSchema = z.object({
  id: z.string().uuid('Invalid roadmap ID'),
});
export type RoadmapIdParamInput = z.infer<typeof RoadmapIdParamSchema>;

export const RemoveRoadmapItemParamSchema = z.object({
  id: z.string().uuid('Invalid roadmap ID'),
  itemId: z.string().uuid('Invalid item ID'),
});
export type RemoveRoadmapItemParamInput = z.infer<typeof RemoveRoadmapItemParamSchema>;
