import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  ExecutionResult,
  Testcase,
  ExecutionConfig,
} from '../src/validations/submission.validation';
import { securityService } from '../src/services/security.service';
import { monitoringService } from '../src/services/monitoring.service';

export interface SandboxConfig {
  host: string;
  port: number;
  timeout: number;
  maxConcurrent: number;
}

export interface SandboxResponse {
  success: boolean;
  result?: {
    summary: {
      passed: number;
      total: number;
      successRate: string;
    };
    results: Array<{
      index: number;
      input: string;
      expected: string;
      actual: string;
      ok: boolean;
      stderr: string;
      executionTime: number;
      error?: string;
    }>;
    processingTime: number;
  };
  error?: string;
}

export class SandboxService {
  private config: SandboxConfig;
  private workspaceDir: string;
  private activeJobs: Map<string, any> = new Map();

  constructor() {
    this.config = {
      host: process.env.SANDBOX_HOST || 'localhost',
      port: parseInt(process.env.SANDBOX_PORT || '4000'),
      timeout: parseInt(process.env.SANDBOX_TIMEOUT || '30000'),
      maxConcurrent: parseInt(process.env.SANDBOX_MAX_CONCURRENT || '5'),
    };

    this.workspaceDir = process.env.WORKSPACE_DIR || path.join(process.cwd(), 'workspace');
    this.ensureWorkspaceDir();
  }

  private ensureWorkspaceDir(): void {
    if (!fs.existsSync(this.workspaceDir)) {
      fs.mkdirSync(this.workspaceDir, { recursive: true });
      console.log(`Created workspace directory: ${this.workspaceDir}`);
    }
  }

  /**
   * Execute code in isolated sandbox environment
   */
  async executeCode(config: ExecutionConfig): Promise<SandboxResponse> {
    const executionId = uuidv4();
    const jobDir = path.join(this.workspaceDir, executionId);
    const startTime = Date.now();

    try {
      // Check concurrent job limit
      if (this.activeJobs.size >= this.config.maxConcurrent) {
        throw new Error('Sandbox is at maximum capacity');
      }

      // Register active job
      this.activeJobs.set(executionId, {
        startTime,
        config,
        status: 'running',
      });

      // Validate code security
      this.validateCodeSecurity(config.code, config.language);

      // Temporary workaround for Windows Docker TLS issue
      // Try Docker first, fallback to simple execution if Docker fails
      if (process.platform === 'win32') {
        try {
          // Try Docker execution first
          await this.createIsolatedWorkspace(jobDir, config);
          const result = await this.executeInSandbox(jobDir, config);
          this.cleanupWorkspace(jobDir);
          this.activeJobs.delete(executionId);

          return {
            success: true,
            result: {
              summary: result.summary,
              results: result.results,
              processingTime: Date.now() - startTime,
            },
          };
        } catch (dockerError: any) {
          console.error('Docker execution failed:', dockerError.message);
          this.cleanupWorkspace(jobDir);

          // Return error instead of fallback
          this.activeJobs.delete(executionId);
          throw new Error(`Code execution failed: ${dockerError.message}`);
        }
      }

      // Create isolated workspace
      await this.createIsolatedWorkspace(jobDir, config);

      // Execute code with security constraints
      const result = await this.executeInSandbox(jobDir, config);

      // Clean up
      this.cleanupWorkspace(jobDir);
      this.activeJobs.delete(executionId);

      return {
        success: true,
        result: {
          summary: result.summary,
          results: result.results,
          processingTime: Date.now() - startTime,
        },
      };
    } catch (error: any) {
      // Clean up on error
      this.cleanupWorkspace(jobDir);
      this.activeJobs.delete(executionId);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  private validateCodeSecurity(code: string, language: string): void {
    // Use security service for validation
    securityService.validateCodeSecurity(code, language);

    // Detect malicious patterns
    const maliciousEvents = monitoringService.detectMaliciousCode(code, language);
    if (maliciousEvents.length > 0) {
      // Log security events
      maliciousEvents.forEach(event => {
        monitoringService.logSecurityEvent(event);
      });

      throw new Error(
        `Code contains malicious patterns: ${maliciousEvents[0]?.message || 'Unknown malicious pattern'}`
      );
    }
  }

  private async createIsolatedWorkspace(jobDir: string, config: ExecutionConfig): Promise<void> {
    // Create job directory
    fs.mkdirSync(jobDir, { recursive: true });

    // Get language configuration
    const langConfig = this.getLanguageConfig(config.language);
    const filePath = path.join(jobDir, langConfig.fileName);

    // Write code to file
    fs.writeFileSync(filePath, config.code, 'utf8');

    // Set proper permissions
    fs.chmodSync(filePath, 0o644);
  }

  private async executeInSandbox(jobDir: string, config: ExecutionConfig): Promise<any> {
    const langConfig = this.getLanguageConfig(config.language);
    const results: any[] = [];
    let passed = 0;

    // Compile if needed
    if (langConfig.needsCompilation) {
      await this.compileCode(jobDir, langConfig, config.memoryLimit);
    }

    // Execute each test case
    for (let i = 0; i < config.testcases.length; i++) {
      const testcase = config.testcases[i];
      if (!testcase) continue;

      const testStart = Date.now();

      try {
        const result = await this.runTestCase(jobDir, langConfig, testcase, config);

        const expected = this.trimOutput(testcase?.output || '');
        const actual = this.trimOutput(result.stdout || '');
        const ok = actual === expected;

        if (ok) passed++;

        results.push({
          testcaseId: testcase.id,
          input: testcase.input || '',
          expectedOutput: expected,
          actualOutput: actual,
          isPassed: ok,
          executionTime: Date.now() - testStart,
          memoryUse: null,
          error: result.exitCode !== 0 ? result.stderr : null,
        });
      } catch (error: any) {
        results.push({
          testcaseId: testcase.id,
          input: testcase.input || '',
          expectedOutput: testcase.output || '',
          actualOutput: null,
          isPassed: false,
          executionTime: Date.now() - testStart,
          memoryUse: null,
          error: error.message,
        });
      }
    }

    return {
      summary: {
        passed,
        total: config.testcases.length,
        successRate:
          config.testcases.length > 0
            ? ((passed / config.testcases.length) * 100).toFixed(2)
            : '0.00',
      },
      results,
    };
  }

  private async compileCode(jobDir: string, langConfig: any, memoryLimit?: string): Promise<void> {
    const absJobDir = path.resolve(jobDir).replace(/\\/g, '/');
    const dockerPath = absJobDir.replace(/^([A-Z]):/, (match, drive) => `/${drive.toLowerCase()}`);

    const dockerArgs = securityService.generateSecureDockerArgs(
      langConfig.image,
      langConfig.compileCmd,
      memoryLimit || '128m',
      30, // 30 seconds timeout
      dockerPath
    );

    const result = await this.runDocker(dockerArgs, '', 30000);

    if (result.exitCode !== 0) {
      throw new Error(`Compilation failed: ${result.stderr}`);
    }
  }

  private async runTestCase(
    jobDir: string,
    langConfig: any,
    testcase: any,
    config: ExecutionConfig
  ): Promise<ExecutionResult> {
    const absJobDir = path.resolve(jobDir).replace(/\\/g, '/');
    const dockerPath = absJobDir.replace(/^([A-Z]):/, (match, drive) => `/${drive.toLowerCase()}`);

    // Create input file
    if (testcase.input) {
      const inputFile = path.join(jobDir, 'input.txt');
      fs.writeFileSync(inputFile, testcase.input, 'utf8');
    }

    const runCommand = testcase.input
      ? `${langConfig.runCmd} < /work/input.txt`
      : langConfig.runCmd;

    const dockerArgs = securityService.generateSecureDockerArgs(
      langConfig.image,
      runCommand,
      config.memoryLimit,
      config.timeLimit,
      dockerPath
    );

    return await this.runDocker(dockerArgs, '', (config.timeLimit + 2) * 1000);
  }

  private runDocker(
    args: string[],
    input: string = '',
    timeout: number = 30000
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      // Find Docker executable
      const dockerCmd = process.platform === 'win32' ? 'docker.exe' : 'docker';

      const proc = spawn(dockerCmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Don't override PATH on Windows
          ...(process.platform !== 'win32' && {
            PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          }),
        },
      });

      let stdout = '';
      let stderr = '';
      let isTimeout = false;
      const startTime = Date.now();

      const timer = setTimeout(() => {
        isTimeout = true;
        proc.kill('SIGKILL');
        reject(new Error('Execution timeout'));
      }, timeout);

      proc.stdout.on('data', data => {
        stdout += data.toString();
        if (stdout.length > 1000000) {
          // 1MB limit
          proc.kill('SIGKILL');
          clearTimeout(timer);
          reject(new Error('Output size limit exceeded'));
        }
      });

      proc.stderr.on('data', data => {
        stderr += data.toString();
        if (stderr.length > 100000) {
          // 100KB limit
          proc.kill('SIGKILL');
          clearTimeout(timer);
          reject(new Error('Error output size limit exceeded'));
        }
      });

      proc.on('close', code => {
        clearTimeout(timer);
        if (!isTimeout) {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code || 0,
            executionTime: Date.now() - startTime,
          });
        }
      });

      proc.on('error', error => {
        clearTimeout(timer);
        reject(error);
      });

      proc.stdin.end();
    });
  }

  private getLanguageConfig(language: string): any {
    const languages = {
      cpp: {
        image: 'gcc:latest',
        fileName: 'main.cpp',
        compileCmd: 'g++ -std=c++17 -O2 -static -s -o /work/solution /work/main.cpp',
        runCmd: '/work/solution',
        needsCompilation: true,
      },
      python: {
        image: 'python:3.11-slim',
        fileName: 'main.py',
        compileCmd: null,
        runCmd: 'python3 -u /work/main.py',
        needsCompilation: false,
      },
      java: {
        image: 'openjdk:17-slim',
        fileName: 'Main.java',
        compileCmd: 'javac /work/Main.java',
        runCmd: 'java -cp /work Main',
        needsCompilation: true,
      },
      javascript: {
        image: 'node:18-slim',
        fileName: 'main.js',
        compileCmd: null,
        runCmd: 'node /work/main.js',
        needsCompilation: false,
      },
    };

    const config = languages[language as keyof typeof languages];
    if (!config) {
      throw new Error(`Unsupported language: ${language}`);
    }
    return config;
  }

  private trimOutput(output: string): string {
    return output.replace(/\r/g, '').replace(/\n+$/, '').trim();
  }

  private cleanupWorkspace(jobDir: string): void {
    setTimeout(() => {
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
        console.log(`Cleaned up workspace: ${jobDir}`);
      } catch (error) {
        console.warn(`Failed to cleanup ${jobDir}:`, error);
      }
    }, 30000); // Cleanup after 30 seconds
  }

  /**
   * Get sandbox status
   */
  getStatus(): {
    activeJobs: number;
    maxConcurrent: number;
    isHealthy: boolean;
    uptime: number;
  } {
    return {
      activeJobs: this.activeJobs.size,
      maxConcurrent: this.config.maxConcurrent,
      isHealthy: this.activeJobs.size < this.config.maxConcurrent,
      uptime: process.uptime(),
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple health check - just check if workspace exists
      const fs = require('fs');
      return fs.existsSync(this.workspaceDir);
    } catch (error) {
      console.error('Health check error:', error);
      return false;
    }
  }
}

// Singleton instance
export const sandboxService = new SandboxService();
