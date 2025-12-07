import { BaseException } from '@/exceptions/auth.exceptions';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ResourceUsage {
  memory: number; // MB
  cpu: number; // percentage
  duration: number; // milliseconds
  processes: number;
  files: number;
}

export interface SecurityEvent {
  timestamp: Date;
  type: 'BLOCKED_PATTERN' | 'RESOURCE_LIMIT' | 'SECURITY_VIOLATION' | 'MALICIOUS_CODE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  submissionId?: string;
  userId?: string;
  details?: any;
}

export class MonitoringService {
  private logDir: string;
  private securityEvents: SecurityEvent[] = [];

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      console.log(`Created logs directory: ${this.logDir}`);
    }
  }

  /**
   * Monitor Docker container resource usage
   */
  async monitorContainer(containerId: string): Promise<ResourceUsage> {
    try {
      // Get container stats using docker stats command
      const stats = await this.getContainerStats(containerId);

      return {
        memory: this.parseMemoryUsage(stats.memory),
        cpu: this.parseCpuUsage(stats.cpu),
        duration: stats.duration,
        processes: stats.processes,
        files: stats.files,
      };
    } catch (error) {
      console.error('Failed to monitor container:', error);
      return {
        memory: 0,
        cpu: 0,
        duration: 0,
        processes: 0,
        files: 0,
      };
    }
  }

  private async getContainerStats(containerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['stats', '--no-stream', '--format', 'json', containerId]);
      let output = '';

      proc.stdout.on('data', data => {
        output += data.toString();
      });

      proc.on('close', code => {
        if (code === 0) {
          try {
            const stats = JSON.parse(output.trim());
            resolve(stats);
          } catch (error) {
            reject(new BaseException('Failed to parse container stats', 500, 'PARSE_STATS_ERROR'));
          }
        } else {
          reject(
            new BaseException(
              `Docker stats command failed with code ${code}`,
              500,
              'DOCKER_STATS_ERROR'
            )
          );
        }
      });

      proc.on('error', error => {
        reject(error);
      });
    });
  }

  private parseMemoryUsage(memoryStr: string): number {
    // Parse memory string like "123.4MiB" to MB
    const match = memoryStr.match(/(\d+\.?\d*)([KMGT]?i?B)/);
    if (match && match[1] && match[2]) {
      const value = parseFloat(match[1]);
      const unit = match[2];

      switch (unit) {
        case 'B':
          return value / 1024 / 1024;
        case 'KiB':
          return value / 1024;
        case 'MiB':
          return value;
        case 'GiB':
          return value * 1024;
        default:
          return value;
      }
    }
    return 0;
  }

  private parseCpuUsage(cpuStr: string): number {
    // Parse CPU percentage string like "12.34%"
    const match = cpuStr.match(/(\d+\.?\d*)%/);
    if (match && match[1]) {
      return parseFloat(match[1]);
    }
    return 0;
  }

  /**
   * Log security event
   */
  logSecurityEvent(event: SecurityEvent): void {
    this.securityEvents.push(event);

    // Write to log file
    const logFile = path.join(this.logDir, 'security.log');
    const logEntry = {
      timestamp: event.timestamp.toISOString(),
      type: event.type,
      severity: event.severity,
      message: event.message,
      submissionId: event.submissionId,
      userId: event.userId,
      details: event.details,
    };

    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

    // Console warning for high severity events
    if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
      console.warn(`🚨 SECURITY ALERT [${event.severity}]: ${event.message}`);
    }
  }

  /**
   * Check for resource limit violations
   */
  checkResourceLimits(
    usage: ResourceUsage,
    limits: {
      maxMemory: number;
      maxCpu: number;
      maxDuration: number;
    }
  ): SecurityEvent[] {
    const events: SecurityEvent[] = [];

    if (usage.memory > limits.maxMemory) {
      events.push({
        timestamp: new Date(),
        type: 'RESOURCE_LIMIT',
        severity: 'HIGH',
        message: `Memory usage exceeded limit: ${usage.memory}MB > ${limits.maxMemory}MB`,
        details: { usage, limits },
      });
    }

    if (usage.cpu > limits.maxCpu) {
      events.push({
        timestamp: new Date(),
        type: 'RESOURCE_LIMIT',
        severity: 'MEDIUM',
        message: `CPU usage exceeded limit: ${usage.cpu}% > ${limits.maxCpu}%`,
        details: { usage, limits },
      });
    }

    if (usage.duration > limits.maxDuration) {
      events.push({
        timestamp: new Date(),
        type: 'RESOURCE_LIMIT',
        severity: 'HIGH',
        message: `Execution time exceeded limit: ${usage.duration}ms > ${limits.maxDuration}ms`,
        details: { usage, limits },
      });
    }

    return events;
  }

  /**
   * Detect malicious code patterns
   */
  detectMaliciousCode(code: string, language: string): SecurityEvent[] {
    const events: SecurityEvent[] = [];
    const maliciousPatterns = [
      // C/C++ patterns
      {
        pattern: /fork\s*\(\s*\)/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'Fork bomb detected',
      },
      {
        pattern: /while\s*\(\s*true\s*\)\s*{[\s\S]*fork\s*\(\s*\)/gi,
        type: 'MALICIOUS_CODE',
        severity: 'CRITICAL',
        message: 'Fork bomb with infinite loop detected',
      },
      {
        pattern: /rm\s+-rf\s+\//gi,
        type: 'MALICIOUS_CODE',
        severity: 'CRITICAL',
        message: 'Attempt to delete root directory detected',
      },
      {
        pattern: /:\(\)\s*{[\s\S]*:\s*}/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'Bash fork bomb detected',
      },
      {
        pattern: /system\s*\(\s*['"]rm\s+-rf/gi,
        type: 'MALICIOUS_CODE',
        severity: 'CRITICAL',
        message: 'System call to delete files detected',
      },
      // Python patterns
      {
        pattern: /import\s+os/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'OS module import detected',
      },
      {
        pattern: /import\s+socket/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'Socket module import detected',
      },
      {
        pattern: /import\s+subprocess/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'Subprocess module import detected',
      },
      {
        pattern: /open\s*\(\s*['"]\/etc/gi,
        type: 'MALICIOUS_CODE',
        severity: 'CRITICAL',
        message: 'Attempt to access system files detected',
      },
      {
        pattern: /socket\.socket/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'Socket creation detected',
      },
      {
        pattern: /subprocess\.run/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'Subprocess execution detected',
      },
      // JavaScript patterns
      {
        pattern: /require\s*\(\s*['"]fs['"]\s*\)/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'File system module import detected',
      },
      {
        pattern: /require\s*\(\s*['"]child_process['"]\s*\)/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'Child process module import detected',
      },
      {
        pattern: /require\s*\(\s*['"]os['"]\s*\)/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'OS module import detected',
      },
      // Java patterns
      {
        pattern: /Runtime\.getRuntime/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'Runtime execution detected',
      },
      {
        pattern: /ProcessBuilder/gi,
        type: 'MALICIOUS_CODE',
        severity: 'HIGH',
        message: 'Process builder detected',
      },
    ];

    for (const { pattern, type, severity, message } of maliciousPatterns) {
      if (pattern.test(code)) {
        events.push({
          timestamp: new Date(),
          type: type as any,
          severity: severity as any,
          message,
          details: { pattern: pattern.source, language },
        });
      }
    }

    return events;
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    recentEvents: SecurityEvent[];
  } {
    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};

    for (const event of this.securityEvents) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    }

    return {
      totalEvents: this.securityEvents.length,
      eventsByType,
      eventsBySeverity,
      recentEvents: this.securityEvents.slice(-10), // Last 10 events
    };
  }

  /**
   * Clean up old logs
   */
  cleanupLogs(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    // 7 days
    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up old log file: ${file}`);
        }
      }
    } catch (error) {
      console.warn(`Failed to cleanup logs: ${error}`);
    }
  }

  /**
   * Export security events to file
   */
  exportSecurityEvents(filename?: string): string {
    const exportFile = filename || path.join(this.logDir, `security-export-${Date.now()}.json`);
    const data = {
      exportedAt: new Date().toISOString(),
      totalEvents: this.securityEvents.length,
      events: this.securityEvents,
    };

    fs.writeFileSync(exportFile, JSON.stringify(data, null, 2));
    console.log(`Security events exported to: ${exportFile}`);

    return exportFile;
  }
}

// Singleton instance
export const monitoringService = new MonitoringService();
