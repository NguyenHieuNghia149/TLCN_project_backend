import { eq, gte, and, lte, count as countFn, desc } from 'drizzle-orm'
import { subDays, startOfDay, endOfDay } from 'date-fns'
import { db } from '@/database/connection'
import {
  users,
  lessons,
  problems,
  submissions,
  exam,
  topics,
} from '@/database/schema'

export class DashboardRepository {
  async getTotalUserCount(): Promise<number> {
    const result = await db.select({ count: countFn() }).from(users)
    return result[0]?.count || 0
  }

  async getTotalLessonsCount(): Promise<number> {
    const result = await db.select({ count: countFn() }).from(lessons)
    return result[0]?.count || 0
  }

  async getTotalProblemsCount(): Promise<number> {
    const result = await db.select({ count: countFn() }).from(problems)
    return result[0]?.count || 0
  }

  async getTotalSubmissionsCount(): Promise<number> {
    const result = await db.select({ count: countFn() }).from(submissions)
    return result[0]?.count || 0
  }

  async getTotalExamsCount(): Promise<number> {
    const result = await db.select({ count: countFn() }).from(exam)
    return result[0]?.count || 0
  }

  async getTotalTopicsCount(): Promise<number> {
    const result = await db.select({ count: countFn() }).from(topics)
    return result[0]?.count || 0
  }

  async getActiveUsersCount(days: number = 30): Promise<number> {
    const dateThreshold = subDays(new Date(), days)
    const result = await db
      .select({ count: countFn() })
      .from(users)
      .where(gte(users.createdAt, dateThreshold))
    return result[0]?.count || 0
  }

  async getUserGrowth(days: number = 7): Promise<
    Array<{ date: string; count: number }>
  > {
    const userGrowth: Array<{ date: string; count: number }> = []

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i)
      const start = startOfDay(date)
      const end = endOfDay(date)

      const result = await db
        .select({ count: countFn() })
        .from(users)
        .where(
          and(gte(users.createdAt, start), lte(users.createdAt, end))
        )

      const dateStr = date.toISOString().split('T')[0] || ''
      userGrowth.push({
        date: dateStr,
        count: result[0]?.count || 0,
      })
    }

    return userGrowth
  }

  async getSubmissionTrend(days: number = 7): Promise<
    Array<{ date: string; count: number }>
  > {
    const submissionTrend: Array<{ date: string; count: number }> = []

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i)
      const start = startOfDay(date)
      const end = endOfDay(date)

      const result = await db
        .select({ count: countFn() })
        .from(submissions)
        .where(
          and(
            gte(submissions.submittedAt, start),
            lte(submissions.submittedAt, end)
          )
        )

      const dateStr = date.toISOString().split('T')[0] || ''
      submissionTrend.push({
        date: dateStr,
        count: result[0]?.count || 0,
      })
    }

    return submissionTrend
  }

  async getSubmissionStatus(): Promise<{
    accepted: number
    rejected: number
    pending: number
  }> {
    const submissionStatusResult = await db
      .select({
        status: submissions.status,
        count: countFn(),
      })
      .from(submissions)
      .groupBy(submissions.status)

    const submissionStatus = {
      accepted: 0,
      rejected: 0,
      pending: 0,
    }

    submissionStatusResult.forEach(
      (item: { status: string; count: number }) => {
        if (item.status === 'ACCEPTED')
          submissionStatus.accepted = item.count
        else if (
          item.status === 'WRONG_ANSWER' ||
          item.status === 'RUNTIME_ERROR' ||
          item.status === 'COMPILATION_ERROR'
        )
          submissionStatus.rejected = item.count
        else if (item.status === 'PENDING' || item.status === 'RUNNING')
          submissionStatus.pending = item.count
      }
    )

    return submissionStatus
  }

  async getRecentUsers(limit: number = 3): Promise<
    Array<{
      id: string
      firstName: string | null
      lastName: string | null
      createdAt: Date
    }>
  > {
    const result = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
    return result
  }

  async getRecentLessons(limit: number = 3): Promise<
    Array<{
      id: string
      title: string | null
      createdAt: Date
    }>
  > {
    const result = await db
      .select({
        id: lessons.id,
        title: lessons.title,
        createdAt: lessons.createdAt,
      })
      .from(lessons)
      .orderBy(desc(lessons.createdAt))
      .limit(limit)
    return result
  }

  async getRecentProblems(limit: number = 3): Promise<
    Array<{
      id: string
      title: string | null
      createdAt: Date
    }>
  > {
    const result = await db
      .select({
        id: problems.id,
        title: problems.title,
        createdAt: problems.createdAt,
      })
      .from(problems)
      .orderBy(desc(problems.createdAt))
      .limit(limit)
    return result
  }

  async getRecentExams(limit: number = 3): Promise<
    Array<{
      id: string
      title: string | null
      createdAt: Date
    }>
  > {
    const result = await db
      .select({
        id: exam.id,
        title: exam.title,
        createdAt: exam.createdAt,
      })
      .from(exam)
      .orderBy(desc(exam.createdAt))
      .limit(limit)
    return result
  }

  async getRecentActivities(): Promise<
    Array<{
      id: string
      type: 'user' | 'lesson' | 'submission' | 'exam'
      title: string
      description: string
      timestamp: Date
    }>
  > {
    const recentActivities: Array<{
      id: string
      type: 'user' | 'lesson' | 'submission' | 'exam'
      title: string
      description: string
      timestamp: Date
    }> = []

    // Recent users
    const recentUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.createdAt)
      .limit(3)

    recentUsers.forEach(
      (user: {
        id: string
        firstName: string | null
        lastName: string | null
        createdAt: Date
      }) => {
        recentActivities.push({
          id: user.id,
          type: 'user',
          title: 'New user registered',
          description: `${user.firstName || ''} ${user.lastName || ''} joined the platform`,
          timestamp: user.createdAt,
        })
      }
    )

    // Recent lessons
    const recentLessons = await db
      .select({
        id: lessons.id,
        title: lessons.title,
        createdAt: lessons.createdAt,
      })
      .from(lessons)
      .orderBy(lessons.createdAt)
      .limit(3)

    recentLessons.forEach(
      (lesson: { id: string; title: string | null; createdAt: Date }) => {
        recentActivities.push({
          id: lesson.id,
          type: 'lesson',
          title: 'New lesson published',
          description: `"${lesson.title || 'Untitled'}" is now live`,
          timestamp: lesson.createdAt,
        })
      }
    )

    // Sort by timestamp and get latest 5
    const sortedActivities = recentActivities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5)

    return sortedActivities
  }

  async getTopicDistribution(
    limit: number = 6
  ): Promise<Array<{ name: string; lessons: number; problems: number }>> {
    // Get all topics
    const allTopics = await db
      .select({
        id: topics.id,
        name: topics.topicName,
      })
      .from(topics)
      .limit(limit)

    // For each topic, count lessons and problems
    const topicData: Array<{
      name: string
      lessons: number
      problems: number
    }> = []

    for (const topic of allTopics) {
      const [lessonsCount, problemsCount] = await Promise.all([
        db
          .select({ count: countFn() })
          .from(lessons)
          .where(eq(lessons.topicId, topic.id)),
        db
          .select({ count: countFn() })
          .from(problems)
          .where(eq(problems.topicId, topic.id)),
      ])

      topicData.push({
        name: topic.name || 'Unknown',
        lessons: lessonsCount[0]?.count || 0,
        problems: problemsCount[0]?.count || 0,
      })
    }

    return topicData
  }
}
