import { CommentEntity } from '@backend/shared/db/schema';

export interface CommentWithMetadata extends CommentEntity {
  isPinned: boolean;
  pinnedByAdminId: string | null;
  pinnedAt: Date | null;
  likeCount: number;
  userHasLiked?: boolean; // Optional: for logged-in user context
}

export interface CommentLikeResponse {
  liked: boolean;
  totalLikes: number;
}

export interface CommentPinResponse {
  commentId: string;
  isPinned: boolean;
  pinnedByAdminId?: string | null;
  pinnedAt?: Date | null;
}

export interface CommentLikeStatus {
  totalLikes: number;
  userHasLiked: boolean;
}

export type BatchLikeStatusResult = Record<string, CommentLikeStatus>;
