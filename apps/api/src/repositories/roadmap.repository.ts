import { and, count, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import {
  roadmapItems,
  roadmapProgress,
  roadmaps,
  RoadmapEntity,
  RoadmapInsert,
  users,
  lessons,
  problems,
} from '@backend/shared/db/schema';

export class RoadmapRepository extends BaseRepository<typeof roadmaps, RoadmapEntity, RoadmapInsert> {
  constructor() {
    super(roadmaps);
  }

  async adminListRoadmaps(params: {
    limit: number;
    offset: number;
    keyword?: string;
    createdBy?: string;
    visibility?: 'public' | 'private';
    createdAtFrom?: Date;
    createdAtTo?: Date;
  }): Promise<
    Array<
      RoadmapEntity & {
        creatorEmail: string | null;
        creatorFirstName: string | null;
        creatorLastName: string | null;
        itemCount: number;
      }
    >
  > {
    const conditions = [];
    if (params.visibility) conditions.push(eq(roadmaps.visibility, params.visibility));
    if (params.createdBy) conditions.push(eq(roadmaps.createdBy, params.createdBy));
    if (params.createdAtFrom) conditions.push(gte(roadmaps.createdAt, params.createdAtFrom));
    if (params.createdAtTo) conditions.push(lte(roadmaps.createdAt, params.createdAtTo));
    if (params.keyword) {
      const q = `%${params.keyword}%`;
      conditions.push(or(ilike(roadmaps.title, q), ilike(roadmaps.description, q)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        roadmap: roadmaps,
        creatorEmail: users.email,
        creatorFirstName: users.firstName,
        creatorLastName: users.lastName,
        itemCount: sql<number>`count(${roadmapItems.id})`,
      })
      .from(roadmaps)
      .leftJoin(users, eq(roadmaps.createdBy, users.id))
      .leftJoin(roadmapItems, eq(roadmapItems.roadmapId, roadmaps.id))
      .where(whereClause)
      .groupBy(roadmaps.id, users.email, users.firstName, users.lastName)
      .orderBy(desc(roadmaps.createdAt), desc(roadmaps.id))
      .limit(params.limit)
      .offset(params.offset);

    return rows.map(r => ({
      ...(r.roadmap as any),
      creatorEmail: r.creatorEmail ?? null,
      creatorFirstName: r.creatorFirstName ?? null,
      creatorLastName: r.creatorLastName ?? null,
      itemCount: Number(r.itemCount ?? 0),
    }));
  }

  async adminCountRoadmaps(params: {
    keyword?: string;
    createdBy?: string;
    visibility?: 'public' | 'private';
    createdAtFrom?: Date;
    createdAtTo?: Date;
  }): Promise<number> {
    const conditions = [];
    if (params.visibility) conditions.push(eq(roadmaps.visibility, params.visibility));
    if (params.createdBy) conditions.push(eq(roadmaps.createdBy, params.createdBy));
    if (params.createdAtFrom) conditions.push(gte(roadmaps.createdAt, params.createdAtFrom));
    if (params.createdAtTo) conditions.push(lte(roadmaps.createdAt, params.createdAtTo));
    if (params.keyword) {
      const q = `%${params.keyword}%`;
      conditions.push(or(ilike(roadmaps.title, q), ilike(roadmaps.description, q)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await this.db
      .select({ total: sql<number>`count(distinct ${roadmaps.id})` })
      .from(roadmaps)
      .where(whereClause);

    return Number(result[0]?.total ?? 0);
  }

  async listRoadmaps(params: {
    limit: number;
    offset: number;
    visibility?: 'public' | 'private';
    createdBy?: string;
  }): Promise<RoadmapEntity[]> {
    const conditions = [];
    if (params.visibility) conditions.push(eq(roadmaps.visibility, params.visibility));
    if (params.createdBy) conditions.push(eq(roadmaps.createdBy, params.createdBy));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return this.db
      .select()
      .from(roadmaps)
      .where(whereClause)
      .orderBy(desc(roadmaps.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  async countRoadmaps(params: {
    visibility?: 'public' | 'private';
    createdBy?: string;
  }): Promise<number> {
    const conditions = [];
    if (params.visibility) conditions.push(eq(roadmaps.visibility, params.visibility));
    if (params.createdBy) conditions.push(eq(roadmaps.createdBy, params.createdBy));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await this.db
      .select({ total: count() })
      .from(roadmaps)
      .where(whereClause);
    return result[0]?.total ?? 0;
  }

  async getRoadmapDetail(roadmapId: string): Promise<{
    roadmap: RoadmapEntity | null;
    items: (typeof roadmapItems.$inferSelect & { itemTitle: string | null })[];
  }> {
    const roadmap = await this.findById(roadmapId);
    if (!roadmap) return { roadmap: null, items: [] };

    const items = await this.db
      .select({
        item: roadmapItems,
        lessonTitle: lessons.title,
        problemTitle: problems.title,
      })
      .from(roadmapItems)
      .leftJoin(lessons, and(eq(roadmapItems.itemType, 'lesson'), eq(roadmapItems.itemId, lessons.id)))
      .leftJoin(problems, and(eq(roadmapItems.itemType, 'problem'), eq(roadmapItems.itemId, problems.id)))
      .where(eq(roadmapItems.roadmapId, roadmapId))
      .orderBy(roadmapItems.order, roadmapItems.id);

    const mappedItems = items.map((row) => ({
      ...row.item,
      itemTitle: row.item.itemType === 'lesson' ? row.lessonTitle : row.problemTitle,
    }));

    return { roadmap, items: mappedItems };
  }

  async adminGetRoadmapDetail(roadmapId: string): Promise<{
    roadmap: (RoadmapEntity & {
      creatorEmail: string | null;
      creatorFirstName: string | null;
      creatorLastName: string | null;
      itemCount: number;
    }) | null;
    items: (typeof roadmapItems.$inferSelect & { itemTitle: string | null })[];
  }> {
    const rows = await this.db
      .select({
        roadmap: roadmaps,
        creatorEmail: users.email,
        creatorFirstName: users.firstName,
        creatorLastName: users.lastName,
        itemCount: sql<number>`count(${roadmapItems.id})`,
      })
      .from(roadmaps)
      .leftJoin(users, eq(roadmaps.createdBy, users.id))
      .leftJoin(roadmapItems, eq(roadmapItems.roadmapId, roadmaps.id))
      .where(eq(roadmaps.id, roadmapId))
      .groupBy(roadmaps.id, users.email, users.firstName, users.lastName)
      .limit(1);

    const roadmapInfo = rows[0];
    if (!roadmapInfo) return { roadmap: null, items: [] };

    const items = await this.db
      .select({
        item: roadmapItems,
        lessonTitle: lessons.title,
        problemTitle: problems.title,
      })
      .from(roadmapItems)
      .leftJoin(lessons, and(eq(roadmapItems.itemType, 'lesson'), eq(roadmapItems.itemId, lessons.id)))
      .leftJoin(problems, and(eq(roadmapItems.itemType, 'problem'), eq(roadmapItems.itemId, problems.id)))
      .where(eq(roadmapItems.roadmapId, roadmapId))
      .orderBy(roadmapItems.order, roadmapItems.id);

    const mappedItems = items.map((row) => ({
      ...row.item,
      itemTitle: row.item.itemType === 'lesson' ? row.lessonTitle : row.problemTitle,
    }));

    return {
      roadmap: {
        ...roadmapInfo.roadmap,
        creatorEmail: roadmapInfo.creatorEmail,
        creatorFirstName: roadmapInfo.creatorFirstName,
        creatorLastName: roadmapInfo.creatorLastName,
        itemCount: Number(roadmapInfo.itemCount),
      },
      items: mappedItems,
    };
  }

  async deleteRoadmapCascade(roadmapId: string): Promise<boolean> {
    const result = await this.db.delete(roadmaps).where(eq(roadmaps.id, roadmapId));
    return (result.rowCount ?? 0) > 0;
  }

  async addRoadmapItem(params: {
    roadmapId: string;
    itemType: 'lesson' | 'problem';
    itemId: string;
    order: number;
  }): Promise<typeof roadmapItems.$inferSelect> {
    const result = await this.db
      .insert(roadmapItems)
      .values({
        roadmapId: params.roadmapId,
        itemType: params.itemType,
        itemId: params.itemId,
        order: params.order,
      })
      .returning();

    return result[0]!;
  }

  async removeRoadmapItem(roadmapId: string, itemId: string): Promise<boolean> {
    const result = await this.db
      .delete(roadmapItems)
      .where(and(eq(roadmapItems.roadmapId, roadmapId), eq(roadmapItems.id, itemId)));
    return (result.rowCount ?? 0) > 0;
  }
}

export function createRoadmapRepository(): RoadmapRepository {
  return new RoadmapRepository();
}
