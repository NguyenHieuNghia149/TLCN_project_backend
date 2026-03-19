import { FsUtils, StringUtils, logger } from '@backend/shared/utils';
import { isDeepStrictEqual } from 'node:util';
import { spawn } from 'child_process';
import * as path from 'path';
import * as yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import { SandboxConfig as GlobalSandboxConfig } from '../../../config/sandbox.config';
import { ExecutionResult, ExecutionConfig } from '@backend/shared/validations/submission.validation';
import { securityService } from '@backend/api/services/security.service';
import { monitoringService } from '@backend/api/services/monitoring.service';

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
      status?: string;
    };
    results: Array<{
      index?: number;
      testcaseId?: string;
      input: string;
      expectedOutput?: string;
      expected?: string;
      actualOutput?: string | null;
      actual?: string;
      isPassed?: boolean;
      ok?: boolean;
      stderr: string;
      executionTime: number;
      error?: string | null;
    }>;
    processingTime: number;
  };
  error?: string;
}

type WrapperEnvelope = {
  actual_output: unknown;
  time_taken_ms: number;
};

export class SandboxService {
  private config: SandboxConfig;
  private workspaceDir: string;
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
    this.ensureWorkspaceDir();
    this.loadSandboxYamlConfig();
  }

  private loadSandboxYamlConfig(): void {
    try {
      const configPath = path.join(process.cwd(), 'config', 'sandbox.yaml');
      if (FsUtils.exists(configPath)) {
        const fileContents = FsUtils.readFile(configPath, 'utf8');
        this.yamlConfig = yaml.parse(fileContents);
        logger.info('Successfully loaded sandbox.yaml configuration');
      } else {
        logger.warn(`Sandbox YAML config not found at ${configPath}`);
      }
    } catch (error) {
      logger.error('Failed to parse sandbox.yaml', error);
    }
  }

  private ensureWorkspaceDir(): void {
    if (!FsUtils.exists(this.workspaceDir)) {
      FsUtils.ensureDir(this.workspaceDir);
      logger.info(`Created workspace directory: ${this.workspaceDir}`);
    }
  }

  async executeCode(config: ExecutionConfig): Promise<SandboxResponse> {
    const executionId = uuidv4();
    const jobDir = path.join(this.workspaceDir, executionId);
    const startTime = Date.now();

    try {
      if (this.activeJobs.size >= this.config.maxConcurrent) {
        throw new Error('Sandbox is at maximum capacity');
      }


      this.activeJobs.set(executionId, {
        startTime,
        config,
        status: 'running',
      });

      this.validateCodeSecurity(config.code, config.language);
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
    } catch (error: any) {
      this.cleanupWorkspace(jobDir);
      this.activeJobs.delete(executionId);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  private validateCodeSecurity(code: string, language: string): void {
    securityService.validateCodeSecurity(code, language);
    const maliciousEvents = monitoringService.detectMaliciousCode(code, language);
    if (maliciousEvents.length > 0) {
      maliciousEvents.forEach(event => monitoringService.logSecurityEvent(event));
      throw new Error(
        `Code contains malicious patterns: ${maliciousEvents[0]?.message || 'Unknown pattern'}`
      );
    }
  }


  private getLastNonEmptyLine(stdout: string): string {
    const lines = stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
    return lines.at(-1) ?? '';
  }

  private tryParseJson(text: string): { success: true; value: unknown } | { success: false } {
    const candidate = this.trimOutput(text);
    if (!candidate) {
      return { success: false };
    }

    try {
      return { success: true, value: JSON.parse(candidate) };
    } catch {
      return { success: false };
    }
  }

  private parseWrapperEnvelope(stdout: string):
    | { valid: true; envelope: WrapperEnvelope }
    | { valid: false; error: string } {
    const candidate = this.getLastNonEmptyLine(stdout);
    if (!candidate) {
      return { valid: false, error: 'wrapper envelope missing or malformed' };
    }

    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { valid: false, error: 'wrapper envelope missing or malformed' };
      }

      if (!Object.prototype.hasOwnProperty.call(parsed, 'actual_output')) {
        return { valid: false, error: 'wrapper envelope missing or malformed' };
      }

      if (!Object.prototype.hasOwnProperty.call(parsed, 'time_taken_ms')) {
        return { valid: false, error: 'wrapper envelope missing or malformed' };
      }

      const timeTakenMs = (parsed as Record<string, unknown>).time_taken_ms;
      if (typeof timeTakenMs !== 'number' || Number.isNaN(timeTakenMs) || timeTakenMs < 0) {
        return {
          valid: false,
          error: 'invalid envelope: time_taken_ms must be a non-negative number',
        };
      }

      return {
        valid: true,
        envelope: {
          actual_output: (parsed as Record<string, unknown>).actual_output,
          time_taken_ms: timeTakenMs,
        },
      };
    } catch {
      return { valid: false, error: 'wrapper envelope missing or malformed' };
    }
  }

  private compareWrapperOutput(expectedOutput: string, actualOutput: unknown): boolean {
    const parsedExpected = this.tryParseJson(expectedOutput);
    if (parsedExpected.success) {
      return isDeepStrictEqual(parsedExpected.value, actualOutput);
    }

    return JSON.stringify(actualOutput) === this.trimOutput(expectedOutput);
  }

  private buildFailureContext(reason: string, stdout: string, stderr: string): string {
    const safeStdout = this.trimOutput(stdout);
    const safeStderr = this.trimOutput(stderr);

    return [
      reason,
      `stdout: ${safeStdout || '<empty>'}`,
      `stderr: ${safeStderr || '<empty>'}`,
    ].join('\n');
  }

  private classifyFailureStatus(errorMessage: string): string {
    const normalized = errorMessage.toLowerCase();

    if (normalized.includes('time limit exceeded') || normalized.includes('timeout')) {
      return 'TIME_LIMIT_EXCEEDED';
    }

    if (normalized.includes('memory limit exceeded') || normalized.includes('out of memory')) {
      return 'MEMORY_LIMIT_EXCEEDED';
    }

    if (normalized.includes('compilation') || normalized.includes('compile')) {
      return 'COMPILATION_ERROR';
    }

    if (
      normalized.includes('runtime') ||
      normalized.includes('process exited with code') ||
      normalized.includes('wrapper envelope missing or malformed') ||
      normalized.includes('invalid envelope')
    ) {
      return 'RUNTIME_ERROR';
    }

    return 'WRONG_ANSWER';
  }

  private determineSummaryStatus(
    results: Array<{ isPassed: boolean; error?: string | null }>,
    total: number
  ): string {
    if (total === 0 || results.every(result => result.isPassed)) {
      return 'ACCEPTED';
    }

    for (const result of results) {
      if (result.isPassed || !result.error) {
        continue;
      }

      const status = this.classifyFailureStatus(result.error);
      if (status !== 'WRONG_ANSWER') {
        return status;
      }
    }

    return 'WRONG_ANSWER';
  }

  private async createIsolatedWorkspace(jobDir: string, config: ExecutionConfig): Promise<void> {
    FsUtils.ensureDir(jobDir);
    const langConfig = this.getLanguageConfig(config.language);
    const fileName =
      langConfig.compile?.source_file_name || langConfig.test_case_run?.source_file_name || 'main';
    const filePath = path.join(jobDir, fileName);

    FsUtils.writeFile(filePath, config.code, 'utf8');
    FsUtils.chmod(filePath, 0o755);
    FsUtils.chmod(jobDir, 0o755);

    logger.info(`Created workspace at ${jobDir}`);
  }

  private async executeInSandbox(jobDir: string, config: ExecutionConfig): Promise<any> {
    const langConfig = this.getLanguageConfig(config.language);
    const results: any[] = [];
    let passed = 0;

    if (langConfig.compile) {
      try {
        await this.compileCode(jobDir, langConfig);
      } catch (compileError: any) {
        return {
          summary: {
            passed: 0,
            total: config.testcases.length,
            successRate: '0.00',
            status: 'COMPILATION_ERROR',
          },
          results: config.testcases.map(tc => ({
            testcaseId: tc.id,
            input: tc.input || '',
            expectedOutput: tc.output || '',
            actualOutput: '',
            isPassed: false,
            executionTime: 0,
            memoryUse: null,
            error: this.buildFailureContext(compileError.message, '', ''),
            stderr: compileError.message,
          })),
        };
      }
    }

    for (const testcase of config.testcases) {
      const expectedOutput = this.trimOutput(testcase.output || '');

      try {
        const result = await this.runWithNsjail(jobDir, langConfig, testcase.input || '', config);
        const rawStdout = result.stdout || '';
        const rawStderr = result.stderr || '';

        const envelopeResult = this.parseWrapperEnvelope(rawStdout);
        if (!envelopeResult.valid) {
          results.push({
            testcaseId: testcase.id,
            input: testcase.input || '',
            expectedOutput,
            actualOutput: null,
            isPassed: false,
            executionTime: 0,
            memoryUse: null,
            error: this.buildFailureContext(envelopeResult.error, rawStdout, rawStderr),
            stderr: rawStderr,
          });
          continue;
        }

        const actualOutput = JSON.stringify(envelopeResult.envelope.actual_output);
        const ok =
          result.exitCode === 0 &&
          this.compareWrapperOutput(expectedOutput, envelopeResult.envelope.actual_output);

        if (ok) {
          passed++;
        }

        const failureReason =
          result.exitCode !== 0 ? `Process exited with code ${result.exitCode}` : 'Wrong Answer';

        results.push({
          testcaseId: testcase.id,
          input: testcase.input || '',
          expectedOutput,
          actualOutput,
          isPassed: ok,
          executionTime: envelopeResult.envelope.time_taken_ms,
          memoryUse: null,
          error: ok ? null : this.buildFailureContext(failureReason, rawStdout, rawStderr),
          stderr: rawStderr,
        });
      } catch (error: any) {
        results.push({
          testcaseId: testcase.id,
          input: testcase.input || '',
          expectedOutput,
          actualOutput: null,
          isPassed: false,
          executionTime: 0,
          memoryUse: null,
          error: this.buildFailureContext(error.message, '', ''),
          stderr: '',
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
        status: this.determineSummaryStatus(results, config.testcases.length),
      },
      results,
    };
  }

  private async compileCode(jobDir: string, langConfig: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!langConfig.compile?.command_template) return resolve();

      const sourceFile = langConfig.compile.source_file_name || 'main';
      const programFile = langConfig.compile.program_file_name || 'a.out';

      const [command, ...args] = langConfig.compile.command_template.map((arg: string) =>
        arg.replace('$SOURCE', sourceFile).replace('$PROGRAM', programFile)
      );

      logger.info(`Compiling natively: ${command} ${args.join(' ')}`);

      const proc = spawn(command!, args, {
        cwd: jobDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15000,
      });
      let stderr = '';
      proc.stderr.on('data', d => (stderr += d.toString()));

      proc.on('close', code => {
        if (code === 0) return resolve();
        reject(new Error(stderr.trim() || 'Compilation failed'));
      });

      proc.on('error', err => reject(new Error(`Compiler failed: ${err.message}`)));
    });
  }

  private resolveAddressSpaceLimit(config: ExecutionConfig, langConfig: any): number {
    const requestedMb = Math.max(64, parseInt(config.memoryLimit || '256'));
    const languageValue = String(langConfig?.value || config.language || '').toLowerCase();

    if (languageValue === 'java') {
      return Math.max(requestedMb, 1024);
    }

    return requestedMb;
  }

  private async runWithNsjail(
    jobDir: string,
    langConfig: any,
    input: string,
    config: ExecutionConfig
  ): Promise<ExecutionResult> {
    const programFile =
      langConfig.test_case_run?.program_file_name ||
      langConfig.compile?.program_file_name ||
      'a.out';
    const sourceFile =
      langConfig.test_case_run?.source_file_name || langConfig.compile?.source_file_name || 'main';
    const timeLimitS = Math.max(1, Math.ceil(config.timeLimit / 1000));

    const innerArgs = langConfig.test_case_run.command_template.map((arg: string) =>
      arg
        .replace('$PROGRAM', programFile)
        .replace('$SOURCE', sourceFile)
        .replace('$TIME_LIMIT', `${timeLimitS}s`)
    );

    const nsjailArgs = [
      '--mode',
      'onc',
      '--quiet',
      '--max_cpus',
      '1',
      '--time_limit',
      `${timeLimitS + 1}`,
      '--rlimit_as',
      `${this.resolveAddressSpaceLimit(config, langConfig)}`,
      '--rlimit_fsize',
      '2',
      '--disable_clone_newnet',
      '--chroot',
      '/',
      '-R',
      '/usr',
      '-R',
      '/lib',
      '-R',
      '/lib64',
      '-R',
      '/bin',
      '-R',
      '/sbin',
      '-R',
      '/etc/alternatives',
      '-B',
      `${jobDir}:/app`,
      '--cwd',
      '/app',
      '--',
      ...innerArgs,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('nsjail', nsjailArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
      }, config.timeLimit + 2000);

      proc.stdout.on('data', d => (stdout += d.toString()));
      proc.stderr.on('data', d => (stderr += d.toString()));

      proc.on('close', code => {
        clearTimeout(timer);
        if (killed) return reject(new Error(`Time limit exceeded (${config.timeLimit}ms)`));

        resolve({
          stdout: stdout.substring(0, 10000),
          stderr: stderr.trim(),
          exitCode: code || 0,
          executionTime: 0,
        });
      });

      proc.on('error', err => {
        clearTimeout(timer);
        reject(new Error(`Nsjail failure: ${err.message}`));
      });

      if (input) {
        proc.stdin.write(input);
        proc.stdin.end();
      } else {
        proc.stdin.end();
      }
    });
  }

  private getLanguageConfig(language: string): any {
    const langConfig = this.yamlConfig?.judge?.languages?.find((l: any) => l.value === language);
    if (!langConfig) throw new Error(`Unsupported language: ${language}`);
    return langConfig;
  }

  private trimOutput(output: string): string {
    return StringUtils.trimOutput(output);
  }

  private cleanupWorkspace(jobDir: string): void {
    setTimeout(() => {
      try {
        FsUtils.remove(jobDir);
      } catch (error) {
        logger.warn(`Cleanup failed for ${jobDir}:`, error);
      }
    }, 60000);
  }

  getStatus() {
    return {
      activeJobs: this.activeJobs.size,
      maxConcurrent: this.config.maxConcurrent,
      isHealthy: this.activeJobs.size < this.config.maxConcurrent,
      uptime: process.uptime(),
    };
  }

  async healthCheck(): Promise<boolean> {
    return FsUtils.exists(this.workspaceDir);
  }
}

export const sandboxService = new SandboxService();
