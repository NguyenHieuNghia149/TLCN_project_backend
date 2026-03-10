import { UserRepository } from '@backend/api/repositories/user.repository';
import { LessonRepository } from '@backend/api/repositories/lesson.repository';
import { ProblemRepository } from '@backend/api/repositories/problem.repository';
import { SubmissionRepository } from '@backend/api/repositories/submission.repository';
import { ExamRepository } from '@backend/api/repositories/exam.repository';
import { TopicRepository } from '@backend/api/repositories/topic.repository';

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalLessons: number;
  totalChallenges: number;
  totalSubmissions: number;
  totalExams: number;
  totalTopics: number;
  userGrowth: Array<{ date: string; count: number }>;
  submissionTrend: Array<{ date: string; count: number }>;
  lessonStats: Array<{ name: string; count: number }>;
  topicDistribution: Array<{ name: string; lessons: number; problems: number }>;
  submissionStatus: {
    accepted: number;
    rejected: number;
    pending: number;
  };
  recentUsers: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    createdAt: Date;
  }>;
  recentLessons: Array<{
    id: string;
    title: string | null;
    createdAt: Date;
  }>;
  recentProblems: Array<{
    id: string;
    title: string | null;
    createdAt: Date;
  }>;
  recentExams: Array<{
    id: string;
    title: string | null;
    createdAt: Date;
  }>;
}

export class DashboardService {
  private userRepository: UserRepository;
  private lessonRepository: LessonRepository;
  private problemRepository: ProblemRepository;
  private submissionRepository: SubmissionRepository;
  private examRepository: ExamRepository;
  private topicRepository: TopicRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.lessonRepository = new LessonRepository();
    this.problemRepository = new ProblemRepository();
    this.submissionRepository = new SubmissionRepository();
    this.examRepository = new ExamRepository();
    this.topicRepository = new TopicRepository();
  }

  async getStats(): Promise<DashboardStats> {
    try {
      // Get all stats in parallel
      const [
        totalUsers,
        totalLessons,
        totalChallenges,
        totalSubmissions,
        totalExams,
        totalTopics,
        activeUsers,
        userGrowth,
        submissionTrend,
        submissionStatus,
        topicDistribution,
        recentUsers,
        recentLessons,
        recentProblems,
        recentExams,
      ] = await Promise.all([
        this.userRepository.countTotal(),
        this.lessonRepository.countTotal(),
        this.problemRepository.countTotal(),
        this.submissionRepository.countTotal(),
        this.examRepository.countTotal(),
        this.topicRepository.countTotal(),
        this.userRepository.countActive(30),
        this.userRepository.getGrowthStats(7),
        this.submissionRepository.getDailyTrend(7),
        this.submissionRepository.getStatusDistribution(),
        this.topicRepository.getTopicDistribution(6),
        this.userRepository.getRecent(3),
        this.lessonRepository.getRecent(3),
        this.problemRepository.getRecent(3),
        this.examRepository.getRecent(3),
      ]);

      return {
        totalUsers,
        activeUsers,
        totalLessons,
        totalChallenges,
        totalSubmissions,
        totalExams,
        totalTopics,
        userGrowth,
        submissionTrend,
        lessonStats: [
          {
            name: 'Lessons',
            count: totalLessons,
          },
          {
            name: 'Topics',
            count: totalTopics,
          },
          {
            name: 'Problems',
            count: totalChallenges,
          },
        ],
        topicDistribution,
        submissionStatus,
        recentUsers,
        recentLessons,
        recentProblems,
        recentExams,
      };
    } catch (error) {
      throw error;
    }
  }
}
