import { LessonEntity, LessonInsert, lessons } from '@/database/schema';
import { BaseRepository } from './base.repository';

export class LessonRepository extends BaseRepository<typeof lessons, LessonEntity, LessonInsert> {
  constructor() {
    super(lessons);
  }
}
