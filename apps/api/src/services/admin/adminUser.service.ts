import { PasswordUtils, logger } from '@backend/shared/utils';
import {
  AdminUserRepository,
  createAdminUserRepository,
} from '@backend/api/repositories/admin/adminUser.repository';
import { UserRepository } from '@backend/api/repositories/user.repository';
import { PaginatedResult, PaginationOptions, UserFilters } from '@backend/api/repositories/user.repository';
import { UserEntity, UserInsert } from '@backend/shared/db/schema';
import { BanUserResponse, UnbanUserResponse, BannedListResponse } from '@backend/api/types/user.types';
import { EMailService, createEMailService } from './../../services/email.service';

// Custom exception classes for Express-based app
class ForbiddenException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenException';
  }
}

class BadRequestException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestException';
  }
}

class NotFoundException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundException';
  }
}

export class AdminUserService {
  private repo: AdminUserRepository;
  private userRepository: UserRepository;
  private emailService: EMailService;

  constructor(deps: { adminUserRepository: AdminUserRepository }) {
    this.repo = deps.adminUserRepository;
    this.userRepository = new UserRepository();
    this.emailService = createEMailService();
  }

  async listUsers(params: {
    filters: UserFilters;
    pagination: PaginationOptions;
  }): Promise<PaginatedResult<UserEntity>> {
    return this.repo.list(params.filters, params.pagination);
  }

  async getUser(id: string): Promise<UserEntity | null> {
    return this.repo.getById(id);
  }

  async createUser(payload: UserInsert): Promise<UserEntity> {
    const data: UserInsert = {
      ...payload,
      password: payload.password
        ? await PasswordUtils.hashPassword(payload.password)
        : (payload as any).password,
    } as UserInsert;
    return this.repo.create(data);
  }

  async updateUser(id: string, payload: Partial<UserInsert>): Promise<UserEntity> {
    const data: Partial<UserInsert> = { ...payload };
    if (payload.password) {
      data.password = await PasswordUtils.hashPassword(payload.password as unknown as string);
    }
    return this.repo.update(id, data);
  }

  async deleteUser(id: string): Promise<void> {
    return this.repo.remove(id);
  }

  async listTeachers(pagination: PaginationOptions): Promise<PaginatedResult<UserEntity>> {
    return this.repo.listByRole('teacher', pagination);
  }

  // --- Ban/Unban Methods ---

  async banUser(
    targetUserId: string,
    adminUserId: string,
    adminRole: string,
    banReason: string,
  ): Promise<BanUserResponse> {
    // 1. Authorization: Check caller is ADMIN or OWNER
    if (!['ADMIN', 'OWNER'].includes(adminRole?.toUpperCase())) {
      logger.warn(`Non-admin ${adminUserId} attempted to ban user ${targetUserId}`);
      throw new ForbiddenException('Only admins can ban users');
    }

    // 2. Validate: Ban reason is not empty and meets length requirements
    if (!banReason || banReason.trim().length < 10) {
      throw new BadRequestException('Ban reason must be at least 10 characters');
    }
    if (banReason.length > 500) {
      throw new BadRequestException('Ban reason cannot exceed 500 characters');
    }

    // 3. Validate: Target user exists
    const targetUser = await this.userRepository.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    // 4. Validate: Cannot ban self (applies to ALL roles, including OWNER)
    if (targetUserId === adminUserId) {
      throw new BadRequestException('Cannot ban yourself');
    }

    // 5. Validate: User is not already banned
    if (targetUser.status === 'banned') {
      throw new BadRequestException('User is already banned');
    }

    // 6. Validate: Cannot ban other admins (only OWNER can)
    if (targetUser.role?.toUpperCase() === 'ADMIN' && adminRole?.toUpperCase() !== 'OWNER') {
      throw new ForbiddenException('Only owner can ban other admins');
    }

    // 7. Execute ban
    await this.userRepository.banUser(targetUserId, banReason, adminUserId);

    // 8. ASYNC: Send email notification (don't wait for it)
    setImmediate(async () => {
      try {
        await this.emailService.sendBanNotification(
          targetUser.email,
          `${targetUser.firstName} ${targetUser.lastName}`,
          banReason
        );
      } catch (error) {
        logger.error(`Failed to send ban notification to ${targetUser.email}`);
      }
    });

    // 9. Log action for audit trail
    logger.info({
      action: 'USER_BANNED',
      targetUserId,
      adminId: adminUserId,
      banReason,
      timestamp: new Date(),
    });

    // 10. Return success response
    return {
      success: true,
      userId: targetUserId,
      status: 'banned',
      bannedAt: new Date(),
      message: `User banned successfully. Notification email sent.`,
    };
  }

  async unbanUser(
    targetUserId: string,
    adminUserId: string,
    adminRole: string,
  ): Promise<UnbanUserResponse> {
    // 1. Authorization: Check caller is ADMIN or OWNER
    if (!['ADMIN', 'OWNER'].includes(adminRole?.toUpperCase())) {
      logger.warn(`Non-admin ${adminUserId} attempted to unban user ${targetUserId}`);
      throw new ForbiddenException('Only admins can unban users');
    }

    // 2. Validate: Target user exists
    const targetUser = await this.userRepository.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    // 3. Validate: User is currently banned
    if (targetUser.status !== 'banned') {
      throw new BadRequestException('User is not banned');
    }

    // 4. Execute unban
    await this.userRepository.unbanUser(targetUserId);

    // 5. ASYNC: Send email notification
    setImmediate(async () => {
      try {
        await this.emailService.sendUnbanNotification(
          targetUser.email,
          `${targetUser.firstName} ${targetUser.lastName}`
        );
      } catch (error) {
        logger.error(`Failed to send unban notification to ${targetUser.email}`);
      }
    });

    // 6. Log action
    logger.info({
      action: 'USER_UNBANNED',
      targetUserId,
      adminId: adminUserId,
      timestamp: new Date(),
    });

    return {
      success: true,
      userId: targetUserId,
      status: 'active',
      message: `User unbanned successfully. Notification email sent.`,
    };
  }

  async listBannedUsers(
    limit: number = 20,
    offset: number = 0,
    adminRole: string,
  ): Promise<{ users: UserEntity[]; total: number }> {
    // 1. Authorization check
    if (!['ADMIN', 'OWNER'].includes(adminRole?.toUpperCase())) {
      throw new ForbiddenException('Only admins can view banned users');
    }

    // 2. Fetch data
    const users = await this.userRepository.getBannedUsers(limit, offset);
    const total = await this.userRepository.countBannedUsers();

    return { users, total };
  }
}

/** Creates an AdminUserService with concrete repository dependencies. */
export function createAdminUserService(): AdminUserService {
  return new AdminUserService({
    adminUserRepository: createAdminUserRepository(),
  });
}
