export interface BanUserResponse {
  success: boolean;
  userId: string;
  status: 'banned';
  bannedAt: Date;
  message: string;
}

export interface UnbanUserResponse {
  success: boolean;
  userId: string;
  status: 'active';
  message: string;
}

export interface BannedListResponse {
  users: any[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}
