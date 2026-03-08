import { spawn } from 'child_process';
import * as path from 'path';
import * as yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import { SandboxConfig as GlobalSandboxConfig } from '../config/sandbox.config';
import { ExecutionResult, Testcase, ExecutionConfig } from '@/validations/submission.validation';
import { securityService } from '@/services/security.service';
import { monitoringService } from '@/services/monitoring.service';
import { FsUtils } from '@/utils/fs';
import { StringUtils } from '@/utils/common';

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
  private hostWorkspaceDir: string = '';
  private activeJobs: Map<string, any> = new Map();
  private yamlConfig: GlobalSandboxConfig | null = null;

  constructor() {
    this.config = {
      host: process.env.SANDBOX_HOST || 'localhost',
      port: parseInt(process.env.SANDBOX_PORT || '4000'),
      timeout: parseInt(process.env.SANDBOX_TIMEOUT || '30000'),
      maxConcurrent: parseInt(process.env.SANDBOX_MAX_CONCURRENT || '5'),
    };

    this.workspaceDir = process.env.WORKSPACE_DIR || path.join(process.cwd(), 'workspace');
    this.hostWorkspaceDir = process.env.HOST_WORKSPACE_DIR || this.workspaceDir;
    this.ensureWorkspaceDir();
    this.loadSandboxYamlConfig();
  }

  private loadSandboxYamlConfig(): void {
    try {
      const configPath = path.join(process.cwd(), 'config', 'sandbox.yaml');
      if (FsUtils.exists(configPath)) {
        const fileContents = FsUtils.readFile(configPath, 'utf8');
        this.yamlConfig = yaml.parse(fileContents);
        console.log('Successfully loaded sandbox.yaml configuration');
      } else {
        console.warn(`Sandbox YAML config not found at ${configPath}`);
      }
    } catch (error) {
      console.error('Failed to parse sandbox.yaml', error);
    }
  }

  private ensureWorkspaceDir(): void {
    if (!FsUtils.exists(this.workspaceDir)) {
      FsUtils.ensureDir(this.workspaceDir);
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
      FsUtils.ensureDir(jobDir);

      // Get language configuration
      const langConfig = this.getLanguageConfig(config.language);

      const fileName =
        langConfig.compile?.source_file_name ||
        langConfig.test_case_run?.source_file_name ||
        'main';
      const filePath = path.join(jobDir, fileName);

      // Write code to file
      FsUtils.writeFile(filePath, config.code, 'utf8');

      // Set proper permissions
      FsUtils.chmod(filePath, 0o755);
      FsUtils.chmod(jobDir, 0o755);

      // Log directory contents for debugging
      console.log(`Created workspace at ${jobDir}`);
      console.log('Directory contents:', FsUtils.readDir(jobDir));
      console.log('File contents:', FsUtils.readFile(filePath, 'utf8'));
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
    if (langConfig.compile) {
      try {
        await this.compileCode(jobDir, langConfig, config.memoryLimit, path.basename(jobDir));
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
        const result = await this.runTestCase(
          jobDir,
          langConfig,
          testcase,
          config,
          path.basename(jobDir)
        );

        const expected = this.trimOutput(testcase?.output || '');
        const actual = this.trimOutput(result.stdout || '');
        const ok = actual === expected;

        if (ok) passed++;

        // Detailed error when output does not match
        let errorMessage = null;
        let stderrMessage = null;

        if (!ok) {
          errorMessage = `Wrong Answer\nExpected: ${expected}\nActual: ${actual}`;
          stderrMessage = `Test case ${i + 1} failed:\n- Input: ${testcase.input}\n- Expected: ${expected}\n- Your output: ${actual}`;
        } else if (result.exitCode !== 0) {
          // If there is a runtime error
          errorMessage = result.stderr;
          stderrMessage = `Runtime Error:\n${result.stderr}`;
        }

        results.push({
          testcaseId: testcase.id,
          input: testcase.input || '',
          expectedOutput: expected,
          actualOutput: actual,
          isPassed: ok,
          executionTime: Date.now() - testStart,
          memoryUse: null,
          error: errorMessage,
          stderr: stderrMessage,
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

  private async compileCode(
    jobDir: string,
    langConfig: any,
    memoryLimit?: string,
    executionId?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const cwd = jobDir;
        const hostCwd = executionId ? path.join(this.hostWorkspaceDir, executionId) : cwd;
        if (!langConfig.compile || !langConfig.compile.command_template) {
          return resolve();
        }

        const sourceFile = langConfig.compile.source_file_name || 'main';
        const programFile = langConfig.compile.program_file_name || 'a.out';
        const cmdTemplate: string[] = langConfig.compile.command_template;
        const image: string = langConfig.compile.image;
        const memory: string = langConfig.compile.memory || '512m';
        const cpuQuota: number = langConfig.compile.cpu_quota || 100000;

        const args = cmdTemplate.map((arg: string) =>
          arg.replace('$SOURCE', sourceFile).replace('$PROGRAM', programFile)
        );

        const dockerArgs = [
          'run',
          '--rm',
          '-v',
          `${hostCwd}:/workspace`,
          '-w',
          '/workspace',
          `--memory=${memory}`,
          `--cpu-quota=${cpuQuota}`,
          '--network',
          'none',
          image,
          ...args,
        ];

        const proc = spawn('docker', dockerArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
        proc.on('close', (code: number | null) => {
          if (code === 0) return resolve();
          // Detailed compile error format
          const errorLines = stderr.trim().split('\n');
          const formattedError = errorLines
            .map(line => line.replace(new RegExp(jobDir, 'g'), '').replace(/\.+\\/g, ''))
            .join('\n');
          return reject(new Error(`Compilation Error:\n${formattedError}`));
        });
        proc.on('error', (err: Error) => {
          reject(new Error(`Compiler Error: ${err.message}\nPlease check your code syntax.`));
        });
      } catch (err) {
        return reject(err);
      }
    });
  }

  private async runTestCase(
    jobDir: string,
    langConfig: any,
    testcase: any,
    config: ExecutionConfig,
    executionId: string
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
    FsUtils.writeFile(inputFile, inputContent, 'utf8');

    return new Promise<ExecutionResult>((resolve, reject) => {
      try {
        const cwd = jobDir;
        const hostCwd = path.join(this.hostWorkspaceDir, executionId);
        let cmd: string;
        let args: string[] = [];

        if (langConfig.test_case_run && langConfig.test_case_run.command_template) {
          const sourceFile =
            langConfig.test_case_run.source_file_name ||
            langConfig.compile?.source_file_name ||
            'main';
          const programFile =
            langConfig.test_case_run.program_file_name ||
            langConfig.compile?.program_file_name ||
            'a.out';
          const timeLimitStr = `${Math.max(1, Math.ceil(config.timeLimit / 1000))}s`;
          const image: string = langConfig.test_case_run.image;
          const cpuQuota: number = langConfig.test_case_run.cpu_quota || 100000;
          // Note: memory limits should be added here too based on config.memoryLimit if desired

          const cmdTemplate: string[] = langConfig.test_case_run.command_template;
          const argsTemplate = cmdTemplate.map((arg: string) =>
            arg
              .replace('$SOURCE', sourceFile)
              .replace('$PROGRAM', programFile)
              .replace('$TIME_LIMIT', timeLimitStr)
          );

          cmd = 'docker';
          args = [
            'run',
            '-i',
            '--rm',
            '-v',
            `${hostCwd}:/workspace`,
            '-w',
            '/workspace',
            `--memory=${config.memoryLimit || '256m'}`,
            `--cpu-quota=${cpuQuota}`,
            '--network',
            'none',
            image,
            ...argsTemplate,
          ];
        } else {
          return reject(new Error('Missing test_case_run command_template configuration'));
        }

        const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
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
            let errorMsg = stderr.trim() || `Process exited with code ${code}`;

            // Map common Docker exit codes back to worker-friendly strings
            if (code === 137) {
              errorMsg = `Memory limit exceeded (Docker OOM Kill). ${errorMsg}`;
            } else if (code === 124) {
              errorMsg = `Time limit exceeded (Execution timeout). ${errorMsg}`;
            }

            return reject(new Error(`Runtime Error: ${errorMsg}`));
          }

          // Check for empty output
          if (!stdout.trim()) {
            return reject(
              new Error('No output generated. Make sure your program prints the result.')
            );
          }

          // Return the output as-is for comparison with expected output
          resolve({
            stdout: stdout.trim(),
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

  private getLanguageConfig(language: string): any {
    if (!this.yamlConfig || !this.yamlConfig.judge || !this.yamlConfig.judge.languages) {
      throw new Error('Sandbox YAML configuration not loaded properly');
    }

    const langConfig = this.yamlConfig.judge.languages.find((l: any) => l.value === language);
    if (!langConfig) {
      throw new Error(`Unsupported language: ${language}`);
    }

    return langConfig;
  }

  private trimOutput(output: string): string {
    return StringUtils.trimOutput(output);
  }

  private cleanupWorkspace(jobDir: string): void {
    setTimeout(() => {
      try {
        FsUtils.remove(jobDir);
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
      return FsUtils.exists(this.workspaceDir);
    } catch (error) {
      console.error('Health check error:', error);
      return false;
    }
  }
}

// Singleton instance
export const sandboxService = new SandboxService();
