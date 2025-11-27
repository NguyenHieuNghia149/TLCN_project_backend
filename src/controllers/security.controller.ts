import { Request, Response, NextFunction } from 'express';
import { monitoringService } from '@/services/monitoring.service';
import { securityService } from '@/services/security.service';
import { BaseException, ErrorHandler } from '@/exceptions/auth.exceptions';
import z from 'zod';

export class SecurityController {
  /**
   * Get security statistics
   */
  async getSecurityStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = monitoringService.getSecurityStats();

      res.status(200).json({
        success: true,
        data: {
          ...stats,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export security events
   */
  async exportSecurityEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { filename } = req.query;
      const exportFile = monitoringService.exportSecurityEvents(filename as string);

      res.status(200).json({
        success: true,
        message: 'Security events exported successfully',
        data: {
          exportFile,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get security profile information
   */
  async getSecurityProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = securityService.getSecurityProfile();

      res.status(200).json({
        success: true,
        data: {
          profile,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Clean up old security logs
   */
  async cleanupLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { maxAge } = req.body;
      monitoringService.cleanupLogs(maxAge);

      res.status(200).json({
        success: true,
        message: 'Security logs cleaned up successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test security validation
   */
  async testSecurityValidation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, language } = req.body;

      if (!code || !language) {
        res.status(400).json({
          success: false,
          message: 'Code and language are required',
        });
      }

      // Test malicious code detection
      const maliciousEvents = monitoringService.detectMaliciousCode(code, language);

      res.status(200).json({
        success: true,
        data: {
          maliciousEvents,
          isSecure: maliciousEvents.length === 0,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    // Handle base exceptions
    if (error instanceof BaseException) {
      const errorResponse = ErrorHandler.getErrorResponse(error);
      return res.status(errorResponse.statusCode).json({
        success: false,
        message: errorResponse.message,
        code: errorResponse.code,
        timestamp: errorResponse.timestamp,
      });
    }

    // Log unexpected errors
    console.error('Unexpected submission error:', error);

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
}
