import { Application } from 'express';
import { Request, Response, NextFunction } from 'express';
import { DatabaseUtils } from '../database/utils';
import authRoutes from './auth.routes';
import challengeRoutes from './challenge.routes';
import topicRoutes from './topic.routes';
import submissionRoutes from './submission.routes';
import securityRoutes from './security.routes';
import sandboxRoutes from '../../sandbox/sandbox.routes';
import { generalLimiter } from '../middlewares/ratelimit.middleware';

function route(app: Application): void {
  app.use('/api', generalLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/challenges', challengeRoutes);
  app.use('/api/topics', topicRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/security', securityRoutes);
  app.use('/api/sandbox', sandboxRoutes);

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
