import {
  SolutionApproachEntity,
  solutionApproaches,
  SolutionApproachInsert,
} from '@/database/schema/solutionApproaches';
import { BaseRepository } from './base.repository';
import { eq } from 'drizzle-orm';

export class SolutionApproachRepository extends BaseRepository<
  typeof solutionApproaches,
  SolutionApproachEntity,
  SolutionApproachInsert
> {
  constructor() {
    super(solutionApproaches);
  }

  async findBySolutionId(solutionId: string): Promise<SolutionApproachEntity[]> {
    const result = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.solutionId, solutionId));
    return result;
  }
}
