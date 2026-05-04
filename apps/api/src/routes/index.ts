import { Application } from 'express';
import { DatabaseUtils } from '@backend/shared/db/utils';
import { generalLimiter } from '../middlewares/ratelimit.middleware';
import { createAuthRouter } from './auth.routes';
import { createChallengeRouter } from './challenge.routes';
import { createSupportedLanguageRouter } from './supportedLanguage.routes';
import { createTopicRouter } from './topic.routes';
import { createSubmissionRouter } from './submission.routes';
import { createSecurityRouter } from './security.routes';
import { createLessonRouter } from './lesson.routes';
import { createLessonDetailRouter } from './lessonDetail.routes';
import { createAdminUserRouter } from './admin/adminUser.routes';
import { createAdminTeacherRouter } from './admin/adminTeacher.routes';
import { createAdminLessonRouter } from './admin/adminLesson.routes';
import { createAdminTopicRouter } from './admin/adminTopic.routes';
import { createDashboardRouter } from './admin/dashboard.routes';
import { createFavoriteRouter } from './favorite.routes';
import { createCommentRouter } from './comment.routes';
import { createLearningProcessRouter } from './learningprocess.routes';
import { createLearnedLessonRouter } from './learned-lesson.routes';
import { createLeaderboardRouter } from './leaderboard.routes';
import { createExamAccessRouter } from './examAccess.routes';
import { createExamRouter } from './exam.routes';
import { createPublicExamRouter } from './publicExam.routes';
import { createNotificationRouter } from './notification.routes';
import { createRoadmapRouter } from './roadmap.routes';
import { createAdminRoadmapRouter } from './admin/adminRoadmap.routes';
import { createUserRouter } from './user.routes';
import { createAdminExamRouter } from './admin/adminExam.routes';

/** Mounts all API routes in the existing middleware order. */
export function registerRoutes(app: Application): void {
  app.use('/api', generalLimiter);

  app.use('/api/auth', createAuthRouter());
  app.use('/api', createSupportedLanguageRouter());
  app.use('/api/challenges', createChallengeRouter());
  app.use('/api/favorites', createFavoriteRouter());
  app.use('/api/topics', createTopicRouter());
  app.use('/api/submissions', createSubmissionRouter());
  app.use('/api/security', createSecurityRouter());
  app.use('/api/lessons', createLessonRouter());
  app.use('/api/lesson-details', createLessonDetailRouter());
  app.use('/api/admin/users', createAdminUserRouter());
  app.use('/api/admin/teachers', createAdminTeacherRouter());
  app.use('/api/admin/lessons', createAdminLessonRouter());
  app.use('/api/admin/topics', createAdminTopicRouter());
  app.use('/api/admin/dashboard', createDashboardRouter());
  app.use('/api/admin/roadmaps', createAdminRoadmapRouter());
  app.use('/api/user', createUserRouter());
  app.use('/api/comments', createCommentRouter());
  app.use('/api/learningprocess', createLearningProcessRouter());
  app.use('/api/learned-lessons', createLearnedLessonRouter());
  app.use('/api/public/exams', createPublicExamRouter());
  app.use('/api/admin/exams', createAdminExamRouter());
  app.use('/api/exams', createExamAccessRouter());
  app.use('/api/exams', createExamRouter());
  app.use('/api/leaderboard', createLeaderboardRouter());
  app.use('/api/notifications', createNotificationRouter());
  app.use('/api', createRoadmapRouter());

  app.use('/api/health', async (req, res) => {
    const dbHealth = await DatabaseUtils.getHealthInfo();
    const poolStatus = DatabaseUtils.getPoolStatus();

    res.json({
      status: dbHealth.connected ? 'healthy' : 'unhealthy',
      database: dbHealth,
      pool: poolStatus,
      timestamp: new Date().toISOString(),
    });
  });
}
