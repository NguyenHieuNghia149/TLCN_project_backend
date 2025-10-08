import { ProblemEntity, ProblemInsert, problems } from '@/database/schema';
import { BaseRepository } from './base.repository';

export class ProblemRepository extends BaseRepository<
  typeof problems,
  ProblemEntity,
  ProblemInsert
> {
  constructor() {
    super(problems);
  }
}
