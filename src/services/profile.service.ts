import { UserRepository } from '@/repositories/user.repository';
import { ProfileRepository } from '../repositories/profile.repository';
import { UpdateProfileInput, ProfileResponse } from '@/validations/profile.validation';
import { UserNotFoundException } from '@/exceptions/auth.exceptions';

export class ProfileService {
  private userRepository: UserRepository;
  private profileRepository: ProfileRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.profileRepository = new ProfileRepository();
  }

  async getProfileWithStatistics(userId: string): Promise<ProfileResponse> {
    // Get user profile
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UserNotFoundException(`User with ID ${userId} not found`);
    }

    // Get user statistics
    const statistics = await this.profileRepository.getUserStatistics(userId);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString() : null,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      statistics: {
        totalSubmissions: statistics.totalSubmissions,
        acceptedSubmissions: statistics.acceptedSubmissions,
        wrongAnswerSubmissions: statistics.wrongAnswerSubmissions,
        timeLimitExceededSubmissions: statistics.timeLimitExceededSubmissions,
        memoryLimitExceededSubmissions: statistics.memoryLimitExceededSubmissions,
        runtimeErrorSubmissions: statistics.runtimeErrorSubmissions,
        compilationErrorSubmissions: statistics.compilationErrorSubmissions,
        totalProblemsSolved: statistics.totalProblemsSolved,
        totalProblemsAttempted: statistics.totalProblemsAttempted,
        acceptanceRate: statistics.acceptanceRate,
      },
    };
  }

  async updateProfile(userId: string, updateData: UpdateProfileInput): Promise<ProfileResponse> {
    // Verify user exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UserNotFoundException(`User with ID ${userId} not found`);
    }

    // Convert dateOfBirth from string to Date if provided
    const updatePayload: any = { ...updateData };
    if (updateData.dateOfBirth) {
      updatePayload.dateOfBirth = new Date(updateData.dateOfBirth);
    }

    // Update user profile
    const updatedUser = await this.userRepository.updateUser(userId, updatePayload);

    // Get updated statistics
    const statistics = await this.profileRepository.getUserStatistics(userId);

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      avatar: updatedUser.avatar,
      gender: updatedUser.gender,
      dateOfBirth: updatedUser.dateOfBirth ? updatedUser.dateOfBirth.toISOString() : null,
      role: updatedUser.role,
      status: updatedUser.status,
      lastLoginAt: updatedUser.lastLoginAt ? updatedUser.lastLoginAt.toISOString() : null,
      createdAt: updatedUser.createdAt.toISOString(),
      updatedAt: updatedUser.updatedAt.toISOString(),
      statistics: {
        totalSubmissions: statistics.totalSubmissions,
        acceptedSubmissions: statistics.acceptedSubmissions,
        wrongAnswerSubmissions: statistics.wrongAnswerSubmissions,
        timeLimitExceededSubmissions: statistics.timeLimitExceededSubmissions,
        memoryLimitExceededSubmissions: statistics.memoryLimitExceededSubmissions,
        runtimeErrorSubmissions: statistics.runtimeErrorSubmissions,
        compilationErrorSubmissions: statistics.compilationErrorSubmissions,
        totalProblemsSolved: statistics.totalProblemsSolved,
        totalProblemsAttempted: statistics.totalProblemsAttempted,
        acceptanceRate: statistics.acceptanceRate,
      },
    };
  }
}

export default ProfileService;

