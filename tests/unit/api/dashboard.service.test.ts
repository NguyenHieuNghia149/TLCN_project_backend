import { DashboardService, createDashboardService } from '@backend/api/services/admin/dashboard.service';
import { UserRepository } from '@backend/api/repositories/user.repository';
import { LessonRepository } from '@backend/api/repositories/lesson.repository';
import { ProblemRepository } from '@backend/api/repositories/problem.repository';
import { SubmissionRepository } from '@backend/api/repositories/submission.repository';
import { ExamRepository } from '@backend/api/repositories/exam.repository';
import { TopicRepository } from '@backend/api/repositories/topic.repository';

describe('DashboardService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses all injected repositories when building dashboard stats', async () => {
    const userRepository = {
      countTotal: jest.fn().mockResolvedValue(10),
      countActive: jest.fn().mockResolvedValue(4),
      getGrowthStats: jest.fn().mockResolvedValue([{ date: '2024-01-01', count: 2 }]),
      getRecent: jest.fn().mockResolvedValue([{ id: 'user-1', firstName: 'A', lastName: 'B', createdAt: new Date() }]),
    } as any;
    const lessonRepository = {
      countTotal: jest.fn().mockResolvedValue(5),
      getRecent: jest.fn().mockResolvedValue([{ id: 'lesson-1', title: 'Arrays', createdAt: new Date() }]),
    } as any;
    const problemRepository = {
      countTotal: jest.fn().mockResolvedValue(8),
      getRecent: jest.fn().mockResolvedValue([{ id: 'problem-1', title: 'Two Sum', createdAt: new Date() }]),
    } as any;
    const submissionRepository = {
      countTotal: jest.fn().mockResolvedValue(20),
      getDailyTrend: jest.fn().mockResolvedValue([{ date: '2024-01-01', count: 3 }]),
      getStatusDistribution: jest.fn().mockResolvedValue({ accepted: 1, rejected: 2, pending: 3 }),
    } as any;
    const examRepository = {
      countTotal: jest.fn().mockResolvedValue(2),
      getRecent: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Midterm', createdAt: new Date() }]),
    } as any;
    const topicRepository = {
      countTotal: jest.fn().mockResolvedValue(3),
      getTopicDistribution: jest.fn().mockResolvedValue([{ name: 'Basics', lessons: 2, problems: 4 }]),
    } as any;
    const service = new DashboardService({
      userRepository,
      lessonRepository,
      problemRepository,
      submissionRepository,
      examRepository,
      topicRepository,
    });

    const result = await service.getStats();

    expect(userRepository.countTotal).toHaveBeenCalledTimes(1);
    expect(lessonRepository.countTotal).toHaveBeenCalledTimes(1);
    expect(problemRepository.countTotal).toHaveBeenCalledTimes(1);
    expect(submissionRepository.countTotal).toHaveBeenCalledTimes(1);
    expect(examRepository.countTotal).toHaveBeenCalledTimes(1);
    expect(topicRepository.countTotal).toHaveBeenCalledTimes(1);
    expect(userRepository.countActive).toHaveBeenCalledWith(30);
    expect(userRepository.getGrowthStats).toHaveBeenCalledWith(7);
    expect(submissionRepository.getDailyTrend).toHaveBeenCalledWith(7);
    expect(submissionRepository.getStatusDistribution).toHaveBeenCalledTimes(1);
    expect(topicRepository.getTopicDistribution).toHaveBeenCalledWith(6);
    expect(userRepository.getRecent).toHaveBeenCalledWith(3);
    expect(lessonRepository.getRecent).toHaveBeenCalledWith(3);
    expect(problemRepository.getRecent).toHaveBeenCalledWith(3);
    expect(examRepository.getRecent).toHaveBeenCalledWith(3);
    expect(result.totalUsers).toBe(10);
    expect(result.totalLessons).toBe(5);
    expect(result.totalChallenges).toBe(8);
    expect(result.totalSubmissions).toBe(20);
    expect(result.totalExams).toBe(2);
    expect(result.totalTopics).toBe(3);
  });

  it('creates a service wired with all concrete dashboard repositories', () => {
    const service = createDashboardService();

    expect(service).toBeInstanceOf(DashboardService);
    expect((service as any).userRepository).toBeInstanceOf(UserRepository);
    expect((service as any).lessonRepository).toBeInstanceOf(LessonRepository);
    expect((service as any).problemRepository).toBeInstanceOf(ProblemRepository);
    expect((service as any).submissionRepository).toBeInstanceOf(SubmissionRepository);
    expect((service as any).examRepository).toBeInstanceOf(ExamRepository);
    expect((service as any).topicRepository).toBeInstanceOf(TopicRepository);
  });
});
