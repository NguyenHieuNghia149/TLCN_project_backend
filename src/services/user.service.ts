import { UserInsert } from '@/database/schema/user';
import { InvalidCredentialsException, ValidationException } from '@/exceptions/auth.exceptions';
import { TokenRepository } from '@/repositories/token.repository';
import { UserRepository } from '@/repositories/user.repository';
import { PasswordUtils } from '@/utils/security';
import { ChangePasswordInput } from '@/validations/auth.validation';

export class UserService {
  private userRepository: UserRepository;
  private tokenRepository: TokenRepository;
  constructor() {
    this.userRepository = new UserRepository();
    this.tokenRepository = new TokenRepository();
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findByIdOrThrow(userId);
    const statistics = await this.userRepository.getUserStatistics(userId);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      statistics,
    };
  }

  async updateProfile(
    userId: string,
    updateData: {
      firstName?: string;
      lastName?: string;
      gender?: string;
      dateOfBirth?: string;
      avatar?: string;
    }
  ) {
    // Create a new object for the update
    const dataToUpdate: any = {
      firstName: updateData.firstName,
      lastName: updateData.lastName,
      gender: updateData.gender,
      avatar: updateData.avatar,
    };

    // Convert dateOfBirth from ISO string to Date if provided
    if (updateData.dateOfBirth) {
      try {
        dataToUpdate.dateOfBirth = new Date(updateData.dateOfBirth);
        if (isNaN(dataToUpdate.dateOfBirth.getTime())) {
          throw new Error('Invalid date format');
        }
      } catch (error) {
        throw new Error('Invalid date format for dateOfBirth');
      }
    }

    try {
      const user = await this.userRepository.updateUser(userId, dataToUpdate);

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        role: user.role,
        status: user.status,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      throw error;
    }
  }

  async changePassword(userId: string, dto: ChangePasswordInput): Promise<void> {
    const passwordValidation = PasswordUtils.validatePasswordStrength(dto.newPassword);
    if (!passwordValidation.isValid) {
      throw new ValidationException(passwordValidation.errors.join(', '));
    }

    const user = await this.userRepository.findByIdOrThrow(userId);

    const isCurrentPasswordValid = await PasswordUtils.comparePassword(
      dto.currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      throw new InvalidCredentialsException('Current password is incorrect');
    }

    const hashedPassword = await PasswordUtils.hashPassword(dto.newPassword);
    await this.userRepository.updatePassword(userId, hashedPassword);
    await this.tokenRepository.revokeAllUserTokens(userId);
  }

  async findUserByEmail(email: string) {
    return this.userRepository.findByEmail(email);
  }

  async updatePassword(userId: string, newHashedPassword: string): Promise<void> {
    await this.userRepository.updatePassword(userId, newHashedPassword);
  }

  async create(userData: UserInsert) {
    return this.userRepository.create(userData);
  }
}
