import { users, UserEntity, UserInsert, updateUserSchema } from '@/database/schema';
import { BaseRepository } from '../base.repository';
import { eq } from 'drizzle-orm';
import { UserRepository, PaginatedResult, PaginationOptions, UserFilters } from '@/repositories/user.repository';

export class AdminUserRepository extends BaseRepository<typeof users, UserEntity, UserInsert> {
  private userRepository: UserRepository;

  constructor() {
    super(users);
    this.userRepository = new UserRepository();
  }

  async list(filters: UserFilters, pagination: PaginationOptions): Promise<PaginatedResult<UserEntity>> {
    return this.userRepository.findUsersWithFilters(filters, pagination);
  }

  async getById(id: string): Promise<UserEntity | null> {
    return this.userRepository.findById(id);
  }

  async create(payload: UserInsert): Promise<UserEntity> {
    return this.userRepository.createUser(payload);
  }

  async update(id: string, payload: Partial<UserInsert>): Promise<UserEntity> {
    return this.userRepository.updateUser(id, payload);
  }

  async remove(id: string): Promise<void> {
    await this.userRepository.deleteUser(id);
  }

  async listByRole(role: string, pagination: PaginationOptions): Promise<PaginatedResult<UserEntity>> {
    return this.userRepository.findUsersWithFilters({ role }, pagination);
  }
}


