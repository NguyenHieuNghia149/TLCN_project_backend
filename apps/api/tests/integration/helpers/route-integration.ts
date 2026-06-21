import express from 'express';
import { JWTUtils } from '@backend/shared/utils/jwt';
import { errorMiddleware } from '@backend/api/middlewares/error.middleware';
import { responseMiddleware } from '@backend/api/middlewares/response.middleware';

export type TestAuthClaims = {
  userId: string;
  email: string;
  role: 'student' | 'teacher' | 'owner';
};

/** Creates a minimal in-process app that mounts a real route factory with the standard API middleware. */
export function createRouteIntegrationApp(options: {
  mountPath: string;
  createRouter: () => express.Router;
}): express.Express {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(responseMiddleware);
  app.use(options.mountPath, options.createRouter());
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: 'NOT_FOUND',
        message: 'API endpoint not found',
        details: null,
      },
    });
  });
  app.use(errorMiddleware);

  return app;
}

/** Creates a real access token for route integration tests. */
export function createAccessToken(claims: TestAuthClaims): string {
  return JWTUtils.generateAccessToken(claims.userId, claims.email, claims.role);
}
