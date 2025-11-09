import { AdminUserRepository } from '@/repositories/admin/adminUser.repository';
import { PaginatedResult, PaginationOptions, UserFilters } from '@/repositories/user.repository';
import { UserEntity, UserInsert } from '@/database/schema';
import { PasswordUtils } from '@/utils/security';

export class AdminUserService {
  private repo: AdminUserRepository;

  constructor() {
    this.repo = new AdminUserRepository();
  }

  async listUsers(params: { filters: UserFilters; pagination: PaginationOptions }): Promise<PaginatedResult<UserEntity>> {
    return this.repo.list(params.filters, params.pagination);
  }

  async getUser(id: string): Promise<UserEntity | null> {
    return this.repo.getById(id);
  }

  async createUser(payload: UserInsert): Promise<UserEntity> {
    const data: UserInsert = {
      ...payload,
      password: payload.password ? await PasswordUtils.hashPassword(payload.password) : (payload as any).password,
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
}


