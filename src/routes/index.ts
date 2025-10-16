import { Application } from 'express';
import { Request, Response, NextFunction } from 'express';
import { DatabaseUtils } from '../database/utils';
import authRoutes from './auth.routes';
import challengeRoutes from './challenge.routes';
import { generalLimiter } from '../middlewares/ratelimit.middleware';

function route(app: Application): void {
  app.use('/api', generalLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/challenges', challengeRoutes);

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

  // app.use('/api/:path(*)', (req: Request, res: Response) => {
  //   res.status(404).json({
  //     success: false,
  //     message: 'API endpoint not found',
  //     code: 'NOT_FOUND',
  //   });
  // });
}

export default route;
