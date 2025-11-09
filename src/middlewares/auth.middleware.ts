import { Request, Response, NextFunction } from 'express';
import { JWTUtils } from '@/utils/jwt';
import { InvalidTokenException, TokenExpiredException } from '@/exceptions/auth.exceptions';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export const authenticationToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void | Response => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token provided',
      code: 'NO_TOKEN',
    });
  }

  try {
    const payload = JWTUtils.verifyAccessToken(token);

    // Check if token is for access token
    if (payload.type !== 'access') {
      throw new InvalidTokenException('Invalid token type');
    }

    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (error) {
    if (error instanceof TokenExpiredException) {
      return res.status(401).json({
        success: false,
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error instanceof InvalidTokenException) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      code: 'AUTH_FAILED',
    });
  }
};

// Role-based authorization middleware
export const requireRole = (roles: string | string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void | Response => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    next();
  };
};

// Admin only middleware
export const requireTeacher = requireRole('teacher');

// Owner only middleware
export const requireOwner = requireRole('owner');

// Owner or Teacher middleware
export const requireTeacherOrOwner = requireRole(['owner', 'teacher']);

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  try {
    const payload = JWTUtils.verifyAccessToken(token);

    if (payload.type === 'access') {
      req.user = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
      };
    }
  } catch (error) {
    // Silently ignore token errors for optional auth
  }

  next();
};
