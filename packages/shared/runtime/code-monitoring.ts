import '../utils/load-env';

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ResourceUsage {
  memory: number;
  cpu: number;
  duration: number;
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

export class CodeMonitoringService {
  private logDir: string;
  private securityEvents: SecurityEvent[] = [];

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  async monitorContainer(containerId: string): Promise<ResourceUsage> {
    try {
      const stats = await this.getContainerStats(containerId);

      return {
        memory: this.parseMemoryUsage(stats.memory),
        cpu: this.parseCpuUsage(stats.cpu),
        duration: stats.duration,
        processes: stats.processes,
        files: stats.files,
      };
    } catch {
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
            resolve(JSON.parse(output.trim()));
          } catch {
            reject(new Error('Failed to parse container stats'));
          }
          return;
        }

        reject(new Error(`Docker stats command failed with code ${code}`));
      });

      proc.on('error', error => {
        reject(error);
      });
    });
  }

  private parseMemoryUsage(memoryStr: string): number {
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
    const match = cpuStr.match(/(\d+\.?\d*)%/);
    if (match && match[1]) {
      return parseFloat(match[1]);
    }
    return 0;
  }

  logSecurityEvent(event: SecurityEvent): void {
    this.securityEvents.push(event);

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
  }

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

  detectMaliciousCode(code: string, language: string): SecurityEvent[] {
    const events: SecurityEvent[] = [];
    const maliciousPatterns = [
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
          type: type as SecurityEvent['type'],
          severity: severity as SecurityEvent['severity'],
          message,
          details: { pattern: pattern.source, language },
        });
      }
    }

    return events;
  }

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
      recentEvents: this.securityEvents.slice(-10),
    };
  }

  cleanupLogs(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
        }
      }
    } catch {
      // Cleanup is best-effort only.
    }
  }

  exportSecurityEvents(filename?: string): string {
    const exportFile = filename || path.join(this.logDir, `security-export-${Date.now()}.json`);
    const data = {
      exportedAt: new Date().toISOString(),
      totalEvents: this.securityEvents.length,
      events: this.securityEvents,
    };

    fs.writeFileSync(exportFile, JSON.stringify(data, null, 2));
    return exportFile;
  }
}

let monitoringServiceInstance: CodeMonitoringService | null = null;

export function getMonitoringService(): CodeMonitoringService {
  if (!monitoringServiceInstance) {
    monitoringServiceInstance = new CodeMonitoringService();
  }

  return monitoringServiceInstance;
}
