import { CommentEntity } from '@backend/shared/db/schema';

/**
 * Comment with metadata for pin and like features
 */
export interface CommentWithMetadata extends CommentEntity {
  isPinned: boolean;
  pinnedByAdminId: string | null;
  pinnedAt: Date | null;
  likeCount: number;
  userHasLiked?: boolean; // Optional: for logged-in user context
}

/**
 * Comment like response from toggle operation
 */
export interface CommentLikeResponse {
  liked: boolean;
  totalLikes: number;
}

/**
 * Comment pin response from pin/unpin operations
 */
export interface CommentPinResponse {
  commentId: string;
  isPinned: boolean;
  pinnedByAdminId?: string | null;
  pinnedAt?: Date | null;
}

/**
 * Like status for a comment
 */
export interface CommentLikeStatus {
  totalLikes: number;
  userHasLiked: boolean;
}

/**
 * Batch like status result
 * Map of commentId -> { totalLikes, userHasLiked }
 */
export type BatchLikeStatusResult = Record<string, CommentLikeStatus>;
