import { eq, and, desc, count, sql } from 'drizzle-orm';
import { submissions, SubmissionEntity } from '@/database/schema';
import { problems as problemsTable } from '@/database/schema';
import { topics } from '@/database/schema';
import { lessons } from '@/database/schema';
import { learnedLessons } from '@/database/schema';
import { ESubmissionStatus } from '@/enums/submissionStatus.enum';
import { db } from '@/database/connection';

export interface TopicProgress {
  topicId: string;
  topicName: string;
  totalProblems: number;
  solvedProblems: number;
  completionPercentage: number;
  lastSubmittedAt: Date | null;
}

export interface LessonProgress {
  lessonId: string;
  lessonTitle: string;
  topicId: string;
  topicName: string;
  totalLessons: number;
  completedLessons: number;
  completionPercentage: number;
  lastCompletedAt: Date | null;
}

export interface LearningProgressResponse {
  userId: string;
  totalTopics: number;
  totalProblems: number;
  totalSolvedProblems: number;
  overallCompletionPercentage: number;
  topicProgress: TopicProgress[];
  recentTopic?: TopicProgress;
}

export interface LessonProgressResponse {
  userId: string;
  totalLessons: number;
  completedLessons: number;
  completionPercentage: number;
  lessonProgress: LessonProgress[];
  recentLesson?: LessonProgress;
}

export class LearningProcessRepository {
  constructor(private dbInstance = db) {}

  /**
   * Get learning progress for a specific user
   */
  async getUserLearningProgress(userId: string): Promise<LearningProgressResponse> {
    try {
      // Get all topics with their problems
      const topicsWithProblems = await this.dbInstance
        .select({
          topicId: topics.id,
          topicName: topics.topicName,
          problemId: problemsTable.id,
        })
        .from(topics)
        .leftJoin(problemsTable, eq(problemsTable.topicId, topics.id));

      // Get all accepted submissions for this user
      const acceptedSubmissions = await this.dbInstance
        .select({
          problemId: submissions.problemId,
          submittedAt: submissions.submittedAt,
        })
        .from(submissions)
        .where(
          and(eq(submissions.userId, userId), eq(submissions.status, ESubmissionStatus.ACCEPTED))
        );

      // Create a set of solved problem IDs for quick lookup
      const solvedProblemIds = new Set(acceptedSubmissions.map(s => s.problemId));

      // Create a map of solved problems by topic for latest submission date
      const solvedByTopic = new Map<string, { count: number; lastSubmittedAt: Date | null }>();

      acceptedSubmissions.forEach(submission => {
        const topic = topicsWithProblems.find(tp => tp.problemId === submission.problemId);
        if (topic) {
          if (!solvedByTopic.has(topic.topicId)) {
            solvedByTopic.set(topic.topicId, { count: 0, lastSubmittedAt: null });
          }
          const current = solvedByTopic.get(topic.topicId)!;
          current.count += 1;
          if (!current.lastSubmittedAt || submission.submittedAt > current.lastSubmittedAt) {
            current.lastSubmittedAt = submission.submittedAt;
          }
        }
      });

      // Group problems by topic
      const topicMap = new Map<string, { topicName: string; problems: Set<string> }>();

      topicsWithProblems.forEach(item => {
        if (!topicMap.has(item.topicId)) {
          topicMap.set(item.topicId, {
            topicName: item.topicName,
            problems: new Set<string>(),
          });
        }
        if (item.problemId) {
          topicMap.get(item.topicId)!.problems.add(item.problemId);
        }
      });

      // Calculate progress for each topic
      const topicProgress: TopicProgress[] = Array.from(topicMap.entries()).map(
        ([topicId, { topicName, problems }]) => {
          const totalProblems = problems.size;
          const solvedProblems = Array.from(problems).filter(p => solvedProblemIds.has(p)).length;
          const completionPercentage =
            totalProblems > 0 ? (solvedProblems / totalProblems) * 100 : 0;
          const topicSolvedData = solvedByTopic.get(topicId);

          return {
            topicId,
            topicName,
            totalProblems,
            solvedProblems,
            completionPercentage: Math.round(completionPercentage),
            lastSubmittedAt: topicSolvedData?.lastSubmittedAt || null,
          };
        }
      );

      // Sort by last submitted date (most recent first)
      const sortedTopicProgress = topicProgress.sort((a, b) => {
        if (!a.lastSubmittedAt) return 1;
        if (!b.lastSubmittedAt) return -1;
        return b.lastSubmittedAt.getTime() - a.lastSubmittedAt.getTime();
      });

      // Calculate overall progress
      const totalTopics = topicProgress.length;
      const totalProblems = Array.from(topicMap.values()).reduce(
        (sum, topic) => sum + topic.problems.size,
        0
      );
      const totalSolvedProblems = solvedProblemIds.size;
      const overallCompletionPercentage =
        totalProblems > 0 ? Math.round((totalSolvedProblems / totalProblems) * 100) : 0;

      // Get the first topic with solved problems
      const recentTopic = sortedTopicProgress.find(tp => tp.solvedProblems > 0);

      return {
        userId,
        totalTopics,
        totalProblems,
        totalSolvedProblems,
        overallCompletionPercentage,
        topicProgress: sortedTopicProgress,
        recentTopic,
      };
    } catch (error) {
      console.error('Error fetching user learning progress:', error);
      throw error;
    }
  }

  /**
   * Get progress for a specific topic
   */
  async getTopicProgress(userId: string, topicId: string): Promise<TopicProgress | null> {
    try {
      const topic = await this.dbInstance
        .select({
          topicId: topics.id,
          topicName: topics.topicName,
        })
        .from(topics)
        .where(eq(topics.id, topicId));

      if (!topic.length) {
        return null;
      }

      const topicProblems = await this.dbInstance
        .select({ id: problemsTable.id })
        .from(problemsTable)
        .where(eq(problemsTable.topicId, topicId));

      const problemIds = topicProblems.map(p => p.id);

      if (problemIds.length === 0) {
        return {
          topicId,
          topicName: topic[0]?.topicName || '',
          totalProblems: 0,
          solvedProblems: 0,
          completionPercentage: 0,
          lastSubmittedAt: null,
        };
      }

      const acceptedCount = await this.dbInstance
        .select({ count: count() })
        .from(submissions)
        .where(
          and(
            eq(submissions.userId, userId),
            eq(submissions.status, ESubmissionStatus.ACCEPTED),
            sql`${submissions.problemId} = ANY(ARRAY[${problemIds.join(',')}])`
          )
        );

      const lastSubmission = await this.dbInstance
        .select({
          submittedAt: submissions.submittedAt,
        })
        .from(submissions)
        .where(
          and(
            eq(submissions.userId, userId),
            eq(submissions.status, ESubmissionStatus.ACCEPTED),
            sql`${submissions.problemId} = ANY(ARRAY[${problemIds.join(',')}])`
          )
        )
        .orderBy(desc(submissions.submittedAt))
        .limit(1);

      const solvedProblems = acceptedCount[0]?.count || 0;
      const totalProblems = problemIds.length;
      const completionPercentage = Math.round((solvedProblems / totalProblems) * 100);

      return {
        topicId,
        topicName: topic[0]?.topicName || '',
        totalProblems,
        solvedProblems,
        completionPercentage,
        lastSubmittedAt: lastSubmission.length > 0 ? lastSubmission[0]?.submittedAt || null : null,
      };
    } catch (error) {
      console.error('Error fetching topic progress:', error);
      throw error;
    }
  }

  /**
   * Get lesson progress for a specific user
   */
  async getUserLessonProgress(userId: string): Promise<LessonProgressResponse> {
    try {
      // Get all lessons with their topics
      const lessonsWithTopics = await this.dbInstance
        .select({
          lessonId: lessons.id,
          lessonTitle: lessons.title,
          topicId: lessons.topicId,
          topicName: topics.topicName,
        })
        .from(lessons)
        .leftJoin(topics, eq(topics.id, lessons.topicId));

      // Get all completed lessons for this user
      const completedLessons = await this.dbInstance
        .select({
          lessonId: learnedLessons.lessonId,
          completedAt: learnedLessons.completedAt,
        })
        .from(learnedLessons)
        .where(eq(learnedLessons.userId, userId));

      // Create a set of completed lesson IDs for quick lookup
      const completedLessonIds = new Set(completedLessons.map(cl => cl.lessonId));

      // Create a map of completed lessons by topic for latest completion date
      const completedByTopic = new Map<string, { count: number; lastCompletedAt: Date | null }>();

      completedLessons.forEach(lesson => {
        const lessonData = lessonsWithTopics.find(l => l.lessonId === lesson.lessonId);
        if (lessonData) {
          if (!completedByTopic.has(lessonData.topicId)) {
            completedByTopic.set(lessonData.topicId, { count: 0, lastCompletedAt: null });
          }
          const current = completedByTopic.get(lessonData.topicId)!;
          current.count += 1;
          if (!current.lastCompletedAt || lesson.completedAt > current.lastCompletedAt) {
            current.lastCompletedAt = lesson.completedAt;
          }
        }
      });

      // Group lessons by topic
      const topicLessonsMap = new Map<
        string,
        { topicName: string; lessons: Set<string>; lessonDetails: Map<string, string> }
      >();

      lessonsWithTopics.forEach(item => {
        if (!topicLessonsMap.has(item.topicId)) {
          topicLessonsMap.set(item.topicId, {
            topicName: item.topicName || '',
            lessons: new Set<string>(),
            lessonDetails: new Map<string, string>(),
          });
        }
        if (item.lessonId) {
          topicLessonsMap.get(item.topicId)!.lessons.add(item.lessonId);
          topicLessonsMap.get(item.topicId)!.lessonDetails.set(item.lessonId, item.lessonTitle);
        }
      });

      // Calculate progress for each topic
      const lessonProgress: LessonProgress[] = Array.from(topicLessonsMap.entries()).flatMap(
        ([topicId, { topicName, lessons: topicLessons, lessonDetails }]) => {
          return Array.from(topicLessons).map(lessonId => {
            const totalLessonsInTopic = topicLessons.size;
            const completedLessonsInTopic = Array.from(topicLessons).filter(l =>
              completedLessonIds.has(l)
            ).length;
            const completionPercentage =
              totalLessonsInTopic > 0
                ? Math.round((completedLessonsInTopic / totalLessonsInTopic) * 100)
                : 0;
            const topicCompletedData = completedByTopic.get(topicId);

            return {
              lessonId,
              lessonTitle: lessonDetails.get(lessonId) || '',
              topicId,
              topicName,
              totalLessons: totalLessonsInTopic,
              completedLessons: completedLessonsInTopic,
              completionPercentage,
              lastCompletedAt: topicCompletedData?.lastCompletedAt || null,
            };
          });
        }
      );

      // Sort by last completed date (most recent first)
      const sortedLessonProgress = lessonProgress.sort((a, b) => {
        if (!a.lastCompletedAt) return 1;
        if (!b.lastCompletedAt) return -1;
        return b.lastCompletedAt.getTime() - a.lastCompletedAt.getTime();
      });

      // Calculate overall progress
      const totalLessons = lessonsWithTopics.filter(l => l.lessonId).length;
      const completedLessonsCount = completedLessonIds.size;
      const completionPercentage =
        totalLessons > 0 ? Math.round((completedLessonsCount / totalLessons) * 100) : 0;

      // Get the first lesson with completed lessons
      const recentLesson = sortedLessonProgress.find(lp => lp.completedLessons > 0);

      return {
        userId,
        totalLessons,
        completedLessons: completedLessonsCount,
        completionPercentage,
        lessonProgress: sortedLessonProgress,
        recentLesson,
      };
    } catch (error) {
      console.error('Error fetching user lesson progress:', error);
      throw error;
    }
  }

  /**
   * Get progress for a specific lesson
   */
  async getLessonProgress(userId: string, lessonId: string): Promise<LessonProgress | null> {
    try {
      const lesson = await this.dbInstance
        .select({
          lessonId: lessons.id,
          lessonTitle: lessons.title,
          topicId: lessons.topicId,
        })
        .from(lessons)
        .where(eq(lessons.id, lessonId));

      if (!lesson.length) {
        return null;
      }

      const topic = await this.dbInstance
        .select({
          topicId: topics.id,
          topicName: topics.topicName,
        })
        .from(topics)
        .where(eq(topics.id, lesson[0]?.topicId || ''));

      // Get all lessons in this topic
      const topicLessons = await this.dbInstance
        .select({ id: lessons.id })
        .from(lessons)
        .where(eq(lessons.topicId, lesson[0]?.topicId || ''));

      const lessonIds = topicLessons.map(l => l.id);

      // Count completed lessons in this topic
      const completedCount = await this.dbInstance
        .select({ count: count() })
        .from(learnedLessons)
        .where(
          and(
            eq(learnedLessons.userId, userId),
            sql`${learnedLessons.lessonId} = ANY(ARRAY[${lessonIds.join(',')}])`
          )
        );

      // Get last completed lesson in this topic
      const lastCompleted = await this.dbInstance
        .select({
          completedAt: learnedLessons.completedAt,
        })
        .from(learnedLessons)
        .where(
          and(
            eq(learnedLessons.userId, userId),
            sql`${learnedLessons.lessonId} = ANY(ARRAY[${lessonIds.join(',')}])`
          )
        )
        .orderBy(desc(learnedLessons.completedAt))
        .limit(1);

      const completedLessons = completedCount[0]?.count || 0;
      const totalLessons = lessonIds.length;
      const completionPercentage = Math.round((completedLessons / totalLessons) * 100);

      return {
        lessonId,
        lessonTitle: lesson[0]?.lessonTitle || '',
        topicId: lesson[0]?.topicId || '',
        topicName: topic.length > 0 ? topic[0]?.topicName || '' : '',
        totalLessons,
        completedLessons,
        completionPercentage,
        lastCompletedAt: lastCompleted.length > 0 ? lastCompleted[0]?.completedAt || null : null,
      };
    } catch (error) {
      console.error('Error fetching lesson progress:', error);
      throw error;
    }
  }
}
