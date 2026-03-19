import { Request, Response, NextFunction } from 'express';
import { monitoringService } from '@backend/shared/runtime/code-monitoring';
import { securityService } from '@backend/shared/runtime/code-security';
import { AppException } from '@backend/api/exceptions/base.exception';

export class SecurityController {
  /**
   * Get security statistics
   */
  async getSecurityStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    const stats = monitoringService.getSecurityStats();

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
    const exportFile = monitoringService.exportSecurityEvents(filename as string);

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
    const profile = securityService.getSecurityProfile();

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
    monitoringService.cleanupLogs(maxAge);

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

    // Test malicious code detection
    const maliciousEvents = monitoringService.detectMaliciousCode(code, language);

    res.status(200).json({
      maliciousEvents,
      isSecure: maliciousEvents.length === 0,
      timestamp: new Date().toISOString(),
    });
  }
}


