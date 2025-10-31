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
    try {
      // Create job directory
      fs.mkdirSync(jobDir, { recursive: true });

      // Get language configuration
      const langConfig = this.getLanguageConfig(config.language);
      const filePath = path.join(jobDir, langConfig.fileName);

      // Write code to file
      fs.writeFileSync(filePath, config.code, 'utf8');

      // Set proper permissions
      fs.chmodSync(filePath, 0o755);
      fs.chmodSync(jobDir, 0o755);

      // Log directory contents for debugging
      console.log(`Created workspace at ${jobDir}`);
      console.log('Directory contents:', fs.readdirSync(jobDir));
      console.log('File contents:', fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error('Error creating workspace:', error);
      throw error;
    }
  }

  private async executeInSandbox(jobDir: string, config: ExecutionConfig): Promise<any> {
    const langConfig = this.getLanguageConfig(config.language);
    const results: any[] = [];
    let passed = 0;

    // Compile if needed
    if (langConfig.needsCompilation) {
      try {
        await this.compileCode(jobDir, langConfig, config.memoryLimit);
      } catch (compileError: any) {
        // Return compilation error for all test cases
        return {
          summary: {
            passed: 0,
            total: config.testcases.length,
            successRate: '0.00',
            status: 'compilation_error',
          },
          results: config.testcases.map(testcase => ({
            testcaseId: testcase.id,
            input: testcase.input || '',
            expectedOutput: testcase.output || '',
            actualOutput: '',
            isPassed: false,
            executionTime: 0,
            memoryUse: null,
            error: compileError.message,
            stderr: compileError.message,
          })),
        };
      }
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
    // Prefer local compilation inside the sandbox container (no nested docker mounts)
    return new Promise((resolve, reject) => {
      try {
        const cwd = jobDir;
        // Determine compile command for local execution (split into args)
        // For C/C++ we expect compileCmd to reference workspace paths; convert to local args
        if (langConfig.compileCmd && langConfig.compileCmd.startsWith('g++')) {
          // Build args like: g++ -std=c++17 -O2 -Wall -o solution main.cpp
          const args = [] as string[];
          // crude parsing, prefer explicit config
          // If compileCmd contains /workspace paths, use filenames in cwd
          args.push('-std=c++17', '-O2', '-Wall', '-o', 'solution', langConfig.fileName);

          const proc = spawn('g++', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
          let stderr = '';
          proc.stderr.on('data', d => (stderr += d.toString()));
          proc.on('close', code => {
            if (code === 0) return resolve();
            return reject(new Error(`Compilation failed: ${stderr.trim()}`));
          });
          proc.on('error', err => reject(err));
        } else if (langConfig.compileCmd) {
          // Fallback: run the compile command in a shell inside cwd
          const proc = spawn('sh', ['-c', langConfig.compileCmd], {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          let stderr = '';
          proc.stderr.on('data', d => (stderr += d.toString()));
          proc.on('close', code => {
            if (code === 0) return resolve();
            return reject(new Error(`Compilation failed: ${stderr.trim()}`));
          });
          proc.on('error', err => reject(err));
        } else {
          // Nothing to compile
          return resolve();
        }
      } catch (err) {
        return reject(err);
      }
    });
  }

  private async runTestCase(
    jobDir: string,
    langConfig: any,
    testcase: any,
    config: ExecutionConfig
  ): Promise<ExecutionResult> {
    // Local execution path (run compiled binary or interpreter in the sandbox container)
    // Convert JSON-style judge inputs like {"nums": [...], "target": x} into plain-text
    let inputContent = testcase.input || '';
    try {
      const trimmed = String(inputContent).trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || trimmed.includes('"nums"')) {
        const obj = JSON.parse(trimmed);
        const nums = obj.nums || obj.numbers || obj.array;
        const target = obj.target;
        if (Array.isArray(nums) && typeof target !== 'undefined') {
          inputContent = `${nums.length}\n${nums.join(' ')}\n${target}\n`;
        }
      }
    } catch (e) {
      // fallback to raw input
    }

    const inputFile = path.join(jobDir, 'input.txt');
    fs.writeFileSync(inputFile, inputContent, 'utf8');

    return new Promise<ExecutionResult>((resolve, reject) => {
      try {
        const cwd = jobDir;
        let cmd: string;
        let args: string[] = [];

        if (langConfig.needsCompilation) {
          // run the produced binary
          cmd = path.join(cwd, 'solution');
          args = [];
        } else {
          // interpreter run (python, node, java etc.)
          const parts = langConfig.runCmd.split(' ');
          cmd = parts[0];
          args = parts
            .slice(1)
            .map((p: string) => p.replace('/work/', `${cwd}/`).replace('/workspace/', `${cwd}/`));
        }

        const proc = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = setTimeout(
          () => {
            killed = true;
            proc.kill('SIGKILL');
          },
          (config.timeLimit + 2) * 1000
        );

        proc.stdout.on('data', d => (stdout += d.toString()));
        proc.stderr.on('data', d => (stderr += d.toString()));

        proc.on('close', code => {
          clearTimeout(timer);
          if (killed) {
            return reject(new Error(`Execution timeout exceeded ${config.timeLimit}ms`));
          }

          // Check for runtime errors
          if (code !== 0) {
            const errorMsg = stderr.trim() || `Process exited with code ${code}`;
            return reject(new Error(`Runtime Error: ${errorMsg}`));
          }

          // Check for empty output
          if (!stdout.trim()) {
            return reject(
              new Error('No output generated. Make sure your program prints the result.')
            );
          }

          // Validate output format
          const output = stdout.trim();
          if (!output.startsWith('[') || !output.endsWith(']')) {
            return reject(new Error('Invalid output format. Expected JSON array format [i,j].'));
          }

          resolve({
            stdout: output,
            stderr: stderr.trim(),
            exitCode: code,
            executionTime: 0,
          });
        });

        proc.on('error', err => {
          clearTimeout(timer);
          reject(new Error(`Execution error: ${err.message}`));
        });

        // Pipe input directly with converted content
        proc.stdin.write(inputContent);
        proc.stdin.end();
      } catch (err) {
        reject(err);
      }
    });
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
        image: 'gcc:11.3.0',
        fileName: 'main.cpp',
        compileCmd: 'g++ -std=c++17 -O2 -Wall -o /workspace/solution /workspace/main.cpp',
        runCmd: '/workspace/solution',
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
