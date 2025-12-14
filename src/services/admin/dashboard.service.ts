import { DashboardRepository } from '@/repositories/admin/dashboard.repository'

export interface DashboardStats {
  totalUsers: number
  activeUsers: number
  totalLessons: number
  totalChallenges: number
  totalSubmissions: number
  totalExams: number
  totalTopics: number
  userGrowth: Array<{ date: string; count: number }>
  submissionTrend: Array<{ date: string; count: number }>
  lessonStats: Array<{ name: string; count: number }>
  topicDistribution: Array<{ name: string; lessons: number; problems: number }>
  submissionStatus: {
    accepted: number
    rejected: number
    pending: number
  }
  recentUsers: Array<{
    id: string
    firstName: string | null
    lastName: string | null
    createdAt: Date
  }>
  recentLessons: Array<{
    id: string
    title: string | null
    createdAt: Date
  }>
  recentProblems: Array<{
    id: string
    title: string | null
    createdAt: Date
  }>
  recentExams: Array<{
    id: string
    title: string | null
    createdAt: Date
  }>
}

export class DashboardService {
  private dashboardRepository: DashboardRepository

  constructor() {
    this.dashboardRepository = new DashboardRepository()
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
        this.dashboardRepository.getTotalUserCount(),
        this.dashboardRepository.getTotalLessonsCount(),
        this.dashboardRepository.getTotalProblemsCount(),
        this.dashboardRepository.getTotalSubmissionsCount(),
        this.dashboardRepository.getTotalExamsCount(),
        this.dashboardRepository.getTotalTopicsCount(),
        this.dashboardRepository.getActiveUsersCount(30),
        this.dashboardRepository.getUserGrowth(7),
        this.dashboardRepository.getSubmissionTrend(7),
        this.dashboardRepository.getSubmissionStatus(),
        this.dashboardRepository.getTopicDistribution(6),
        this.dashboardRepository.getRecentUsers(3),
        this.dashboardRepository.getRecentLessons(3),
        this.dashboardRepository.getRecentProblems(3),
        this.dashboardRepository.getRecentExams(3),
      ])

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
      }
    } catch (error) {
      console.error('Error getting dashboard stats:', error)
      throw error
    }
  }
}
