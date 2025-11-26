import { Application } from 'express';
import { Request, Response, NextFunction } from 'express';
import { DatabaseUtils } from '../database/utils';
import authRoutes from './auth.routes';
import challengeRoutes from './challenge.routes';
import topicRoutes from './topic.routes';
import submissionRoutes from './submission.routes';
import securityRoutes from './security.routes';
import sandboxRoutes from '../../sandbox/sandbox.routes';
import lessonRoutes from './lesson.routes';
import lessonDetailRoutes from './lessonDetail.routes';
import adminUserRoutes from './admin/adminUser.routes';
import adminTeacherRoutes from './admin/adminTeacher.routes';
import favoriteRoutes from './favorite.routes';
import commentRoutes from './comment.routes';
import learningProcessRoutes from './learningprocess.routes'
import learnedLessonRoutes from './learned-lesson.routes'
import { generalLimiter } from '../middlewares/ratelimit.middleware'

function route(app: Application): void {
  app.use('/api', generalLimiter)

  app.use('/api/auth', authRoutes)
  app.use('/api/challenges', challengeRoutes)
  app.use('/api/favorites', favoriteRoutes)
  app.use('/api/topics', topicRoutes)
  app.use('/api/submissions', submissionRoutes)
  app.use('/api/security', securityRoutes)
  app.use('/api/sandbox', sandboxRoutes)
  app.use('/api/lessons', lessonRoutes)
  app.use('/api/lesson-details', lessonDetailRoutes)
  app.use('/api/admin/users', adminUserRoutes)
  app.use('/api/admin/teachers', adminTeacherRoutes)
  app.use('/api/comments', commentRoutes)
  app.use('/api/learningprocess', learningProcessRoutes)
  app.use('/api/learned-lessons', learnedLessonRoutes)

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

export default route;
