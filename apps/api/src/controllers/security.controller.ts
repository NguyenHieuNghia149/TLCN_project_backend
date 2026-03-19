import { AppException } from '@backend/api/exceptions/base.exception';
import { getMonitoringService } from '@backend/shared/runtime/code-monitoring';
import { getSecurityService } from '@backend/shared/runtime/code-security';
import { NextFunction, Request, Response } from 'express';

export class SecurityController {
  /**
   * Get security statistics
   */
  async getSecurityStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    const stats = getMonitoringService().getSecurityStats();

    res.status(200).json({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Export security events
   */
  async exportSecurityEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { filename } = req.query;
    const exportFile = getMonitoringService().exportSecurityEvents(filename as string);

    res.status(200).json({
      message: 'Security events exported successfully',
      exportFile,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get security profile information
   */
  async getSecurityProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    const profile = getSecurityService().getSecurityProfile();

    res.status(200).json({
      profile,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Clean up old security logs
   */
  async cleanupLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { maxAge } = req.body;
    getMonitoringService().cleanupLogs(maxAge);

    res.status(200).json({
      message: 'Security logs cleaned up successfully',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Test security validation
   */
  async testSecurityValidation(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { code, language } = req.body;

    if (!code || !language) {
      throw new AppException('Code and language are required', 400, 'MISSING_FIELDS');
    }

    const maliciousEvents = getMonitoringService().detectMaliciousCode(code, language);

    res.status(200).json({
      maliciousEvents,
      isSecure: maliciousEvents.length === 0,
      timestamp: new Date().toISOString(),
    });
  }
}
