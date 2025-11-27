import { SubmissionRepository } from './submission.repository';
import { LearnedLessonRepository } from './learned-lesson.repository';
import { ProblemRepository } from './problem.repository';
import { LessonRepository } from './lesson.repository';
import { TopicRepository } from './topic.repository';
import { ESubmissionStatus } from '@/enums/ESubmissionStatus';
import {
  TopicProgress,
  LessonProgress,
  LearningProgressResponse,
  LessonProgressResponse,
} from '@/validations/learningprocess.validation';

export class LearningProcessRepository {
  private submissionRepository: SubmissionRepository;
  private learnedLessonRepository: LearnedLessonRepository;
  private problemRepository: ProblemRepository;
  private lessonRepository: LessonRepository;
  private topicRepository: TopicRepository;

  constructor() {
    this.submissionRepository = new SubmissionRepository();
    this.learnedLessonRepository = new LearnedLessonRepository();
    this.problemRepository = new ProblemRepository();
    this.lessonRepository = new LessonRepository();
    this.topicRepository = new TopicRepository();
  }

  /**
   * Get learning progress for a specific user
   * Aggregates data from submission repository and problem/topic data
   */
  async getUserLearningProgress(userId: string): Promise<LearningProgressResponse> {
    try {
      // Get all accepted submissions for this user
      const submissionResult = await this.submissionRepository.findByUserId(userId, { limit: 1000 });
      const allSubmissions = submissionResult.data;

      // Filter only accepted submissions
      const acceptedSubmissions = allSubmissions.filter(
        (s) => s.status === ESubmissionStatus.ACCEPTED
      );

      // Get all topics
      const topicsResult = await this.topicRepository.findMany({ limit: 1000 });
      const allTopics = topicsResult.data;

      // Get solved problem IDs
      const solvedProblemIds = new Set(acceptedSubmissions.map((s) => s.problemId));

      // Build topic progress
      const topicProgressMap = new Map<string, TopicProgress>();

      for (const topic of allTopics) {
        // Get problems for this topic
        const problems = await this.problemRepository.getProblemsByTopicId(topic.id);
        const problemIds = problems.map((p) => p.id);

        // Count solved problems in this topic
        const solvedCount = problemIds.filter((pId) => solvedProblemIds.has(pId)).length;

        // Get latest submission date for this topic
        const topicSubmissions = acceptedSubmissions.filter((s) =>
          problemIds.includes(s.problemId)
        );
        const latestSubmission = topicSubmissions.length > 0
          ? topicSubmissions.reduce((latest, current) =>
              current.submittedAt > latest.submittedAt ? current : latest
            )
          : null;

        topicProgressMap.set(topic.id, {
          topicId: topic.id,
          topicName: topic.topicName,
          totalProblems: problemIds.length,
          solvedProblems: solvedCount,
          completionPercentage:
            problemIds.length > 0
              ? Math.round((solvedCount / problemIds.length) * 100)
              : 0,
          lastSubmittedAt: latestSubmission?.submittedAt || null,
        });
      }

      // Sort by latest submission
      const sortedTopicProgress = Array.from(topicProgressMap.values()).sort((a, b) => {
        if (!a.lastSubmittedAt) return 1;
        if (!b.lastSubmittedAt) return -1;
        return b.lastSubmittedAt.getTime() - a.lastSubmittedAt.getTime();
      });

      // Get recent topic with solved problems
      const recentTopic = sortedTopicProgress.find((tp) => tp.solvedProblems > 0);

      return {
        userId,
        totalTopics: allTopics.length,
        totalProblems: Array.from(topicProgressMap.values()).reduce(
          (sum, tp) => sum + tp.totalProblems,
          0
        ),
        totalSolvedProblems: solvedProblemIds.size,
        overallCompletionPercentage:
          solvedProblemIds.size > 0
            ? Math.round(
                (solvedProblemIds.size /
                  Array.from(topicProgressMap.values()).reduce(
                    (sum, tp) => sum + tp.totalProblems,
                    0
                  )) *
                  100
              )
            : 0,
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
      // Get topic info
      const topic = await this.topicRepository.findById(topicId);
      if (!topic) {
        return null;
      }

      // Get problems for this topic
      const problems = await this.problemRepository.getProblemsByTopicId(topicId);
      const problemIds = problems.map((p) => p.id);

      if (problemIds.length === 0) {
        return {
          topicId,
          topicName: topic.topicName,
          totalProblems: 0,
          solvedProblems: 0,
          completionPercentage: 0,
          lastSubmittedAt: null,
        };
      }

      // Get user's accepted submissions
      const submissionResult = await this.submissionRepository.findByUserId(userId, { limit: 1000 });
      const acceptedSubmissions = submissionResult.data.filter(
        (s) => s.status === ESubmissionStatus.ACCEPTED && problemIds.includes(s.problemId)
      );

      // Get latest submission date
      const latestSubmission =
        acceptedSubmissions.length > 0
          ? acceptedSubmissions.reduce((latest, current) =>
              current.submittedAt > latest.submittedAt ? current : latest
            )
          : null;

      return {
        topicId,
        topicName: topic.topicName,
        totalProblems: problemIds.length,
        solvedProblems: acceptedSubmissions.length,
        completionPercentage: Math.round(
          (acceptedSubmissions.length / problemIds.length) * 100
        ),
        lastSubmittedAt: latestSubmission?.submittedAt || null,
      };
    } catch (error) {
      console.error('Error fetching topic progress:', error);
      throw error;
    }
  }

  /**
   * Get lesson progress for a specific user
   * Aggregates data from learned lessons repository
   */
  async getUserLessonProgress(userId: string): Promise<LessonProgressResponse> {
    try {
      // Get all completed lessons for this user
      const completedLessons = await this.learnedLessonRepository.getCompletedLessonsByUser(userId);
      const completedLessonIds = new Set(completedLessons.map((cl) => cl.lessonId));

      // Get all lessons
      const lessonsResult = await this.lessonRepository.findMany({ limit: 1000 });
      const allLessons = lessonsResult.data;

      // Build lesson progress by topic
      const lessonProgressMap = new Map<string, LessonProgress>();

      for (const lesson of allLessons) {
        // Get topic info
        const topic = await this.topicRepository.findById(lesson.topicId);
        if (!topic) continue;

        // Get all lessons for this topic
        const topicLessons = await this.lessonRepository.getLessonsByTopicId(lesson.topicId);
        const topicLessonIds = topicLessons.map((l) => l.id);

        // Count completed lessons in this topic
        const completedCount = topicLessonIds.filter((lId) => completedLessonIds.has(lId)).length;

        // Get latest completion date for this topic
        const topicCompletedLessons = completedLessons.filter((cl) =>
          topicLessonIds.includes(cl.lessonId)
        );
        const latestCompletion =
          topicCompletedLessons.length > 0
            ? topicCompletedLessons.reduce((latest, current) =>
                current.completedAt > latest.completedAt ? current : latest
              )
            : null;

        lessonProgressMap.set(lesson.id, {
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          topicId: lesson.topicId,
          topicName: topic.topicName,
          totalLessons: topicLessonIds.length,
          completedLessons: completedCount,
          completionPercentage:
            topicLessonIds.length > 0
              ? Math.round((completedCount / topicLessonIds.length) * 100)
              : 0,
          lastCompletedAt: latestCompletion?.completedAt || null,
        });
      }

      // Sort by latest completion
      const sortedLessonProgress = Array.from(lessonProgressMap.values()).sort((a, b) => {
        if (!a.lastCompletedAt) return 1;
        if (!b.lastCompletedAt) return -1;
        return b.lastCompletedAt.getTime() - a.lastCompletedAt.getTime();
      });

      // Get recent lesson with completed lessons
      const recentLesson = sortedLessonProgress.find((lp) => lp.completedLessons > 0);

      return {
        userId,
        totalLessons: allLessons.length,
        completedLessons: completedLessonIds.size,
        completionPercentage:
          allLessons.length > 0
            ? Math.round((completedLessonIds.size / allLessons.length) * 100)
            : 0,
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
      // Get lesson info
      const lesson = await this.lessonRepository.findById(lessonId);
      if (!lesson) {
        return null;
      }

      // Get topic info
      const topic = await this.topicRepository.findById(lesson.topicId);
      if (!topic) {
        return null;
      }

      // Get all lessons for this topic
      const topicLessons = await this.lessonRepository.getLessonsByTopicId(lesson.topicId);
      const topicLessonIds = topicLessons.map((l) => l.id);

      // Get user's completed lessons
      const completedLessons = await this.learnedLessonRepository.getCompletedLessonsByUser(userId);
      const completedCount = completedLessons.filter((cl) => topicLessonIds.includes(cl.lessonId))
        .length;

      // Get latest completion date for this topic
      const latestCompletion =
        completedLessons.length > 0
          ? completedLessons.reduce((latest, current) =>
              current.completedAt > latest.completedAt ? current : latest
            )
          : null;

      return {
        lessonId,
        lessonTitle: lesson.title,
        topicId: lesson.topicId,
        topicName: topic.topicName,
        totalLessons: topicLessonIds.length,
        completedLessons: completedCount,
        completionPercentage:
          topicLessonIds.length > 0
            ? Math.round((completedCount / topicLessonIds.length) * 100)
            : 0,
        lastCompletedAt: latestCompletion?.completedAt || null,
      };
    } catch (error) {
      console.error('Error fetching lesson progress:', error);
      throw error;
    }
  }
}
