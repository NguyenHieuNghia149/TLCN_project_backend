import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ExecutionResult, Testcase, ExecutionConfig } from '@/validations/submission.validation';
import { securityService } from './security.service';
import { monitoringService } from './monitoring.service';

// Security configuration
interface SecurityConfig {
  maxCodeLength: number;
  maxOutputSize: number;
  maxErrorSize: number;
  maxExecutionTime: number;
  maxMemoryUsage: string;
  allowedLanguages: string[];
  blockedPatterns: RegExp[];
  seccompProfile: string;
  apparmorProfile: string;
}

export interface TestcaseResult {
  index: number;
  input: string;
  expected: string;
  actual: string;
  ok: boolean;
  stderr: string;
  executionTime: number;
  error?: string;
}

export interface BatchExecutionResult {
  summary: {
    passed: number;
    total: number;
    successRate: string;
  };
  results: TestcaseResult[];
  processingTime: number;
}

// Security configuration
const securityConfig: SecurityConfig = {
  maxCodeLength: 50000, // 50KB
  maxOutputSize: 1000000, // 1MB
  maxErrorSize: 100000, // 100KB
  maxExecutionTime: 30000, // 30 seconds
  maxMemoryUsage: '512m',
  allowedLanguages: ['cpp', 'python', 'java', 'javascript'],
  blockedPatterns: [
    /import\s+os|require\s*\(\s*['"]os['"]\s*\)/gi, // Block OS access
    /import\s+subprocess|require\s*\(\s*['"]child_process['"]\s*\)/gi, // Block subprocess
    /import\s+sys|require\s*\(\s*['"]fs['"]\s*\)/gi, // Block file system access
    /exec\s*\(|eval\s*\(|system\s*\(/gi, // Block code execution
    /__import__\s*\(|getattr\s*\(|setattr\s*\(/gi, // Block dynamic imports
    /open\s*\(|file\s*\(|fopen\s*\(/gi, // Block file operations
    /socket|network|http|https|fetch/gi, // Block network access
    /process\.env|process\.argv|process\.exit/gi, // Block process access
    /Buffer|require\s*\(\s*['"]crypto['"]\s*\)/gi, // Block crypto operations
  ],
  seccompProfile: 'default.json',
  apparmorProfile: 'docker-default',
};

// Language configurations with enhanced security
const languages = {
  cpp: {
    image: 'gcc:latest',
    fileName: 'main.cpp',
    compileCmd: 'g++ -std=c++17 -O2 -static -s -o /work/solution /work/main.cpp',
    runCmd: '/work/solution',
    timeout: 10,
    needsCompilation: true,
    securityFlags: [
      '--security-opt=seccomp=unconfined',
      '--security-opt=apparmor=unconfined',
      '--cap-drop=ALL',
      '--read-only',
      '--no-new-privileges',
    ],
  },
  python: {
    image: 'python:3.11-slim',
    fileName: 'main.py',
    compileCmd: null,
    runCmd: 'python3 -u /work/main.py',
    timeout: 15,
    needsCompilation: false,
    securityFlags: [
      '--security-opt=seccomp=unconfined',
      '--security-opt=apparmor=unconfined',
      '--cap-drop=ALL',
      '--read-only',
      '--no-new-privileges',
    ],
  },
  java: {
    image: 'openjdk:17-slim',
    fileName: 'Main.java',
    compileCmd: 'javac /work/Main.java',
    runCmd: 'java -cp /work Main',
    timeout: 15,
    needsCompilation: true,
    securityFlags: [
      '--security-opt=seccomp=unconfined',
      '--security-opt=apparmor=unconfined',
      '--cap-drop=ALL',
      '--read-only',
      '--no-new-privileges',
    ],
  },
  javascript: {
    image: 'node:18-slim',
    fileName: 'main.js',
    compileCmd: null,
    runCmd: 'node /work/main.js',
    timeout: 10,
    needsCompilation: false,
    securityFlags: [
      '--security-opt=seccomp=unconfined',
      '--security-opt=apparmor=unconfined',
      '--cap-drop=ALL',
      '--read-only',
      '--no-new-privileges',
    ],
  },
};

export class CodeExecutionService {
  private workspaceDir: string;
  private securityConfig: SecurityConfig;

  constructor() {
    this.workspaceDir = process.env.WORKSPACE_DIR || path.join(process.cwd(), 'workspace');
    this.securityConfig = securityConfig;
    this.ensureWorkspaceDir();
  }

  private ensureWorkspaceDir(): void {
    if (!fs.existsSync(this.workspaceDir)) {
      fs.mkdirSync(this.workspaceDir, { recursive: true });
      console.log(`Created workspace directory: ${this.workspaceDir}`);
    }
  }

  /**
   * Validate code for security threats
   */
  private validateCodeSecurity(code: string, language: string): void {
    // Check code length
    if (code.length > this.securityConfig.maxCodeLength) {
      throw new Error(
        `Code too long. Maximum ${this.securityConfig.maxCodeLength} characters allowed.`
      );
    }

    // Check if language is allowed
    if (!this.securityConfig.allowedLanguages.includes(language)) {
      throw new Error(`Language '${language}' is not allowed.`);
    }

    // Check for blocked patterns
    for (const pattern of this.securityConfig.blockedPatterns) {
      if (pattern.test(code)) {
        throw new Error(`Code contains blocked pattern: ${pattern.source}`);
      }
    }

    // Language-specific security checks
    this.performLanguageSpecificChecks(code, language);

    // Additional security validation using security service
    securityService.validateCodeSecurity(code, language);

    // Detect malicious code patterns
    const maliciousEvents = monitoringService.detectMaliciousCode(code, language);
    for (const event of maliciousEvents) {
      monitoringService.logSecurityEvent(event);
    }
  }

  /**
   * Perform language-specific security checks
   */
  private performLanguageSpecificChecks(code: string, language: string): void {
    switch (language) {
      case 'python':
        this.validatePythonCode(code);
        break;
      case 'javascript':
        this.validateJavaScriptCode(code);
        break;
      case 'java':
        this.validateJavaCode(code);
        break;
      case 'cpp':
        this.validateCppCode(code);
        break;
    }
  }

  private validatePythonCode(code: string): void {
    const dangerousPatterns = [
      /__import__\s*\(/gi,
      /exec\s*\(/gi,
      /eval\s*\(/gi,
      /compile\s*\(/gi,
      /open\s*\(/gi,
      /file\s*\(/gi,
      /input\s*\(/gi,
      /raw_input\s*\(/gi,
      /os\./gi,
      /sys\./gi,
      /subprocess\./gi,
      /socket\./gi,
      /urllib/gi,
      /requests/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new Error(`Python code contains dangerous pattern: ${pattern.source}`);
      }
    }
  }

  private validateJavaScriptCode(code: string): void {
    const dangerousPatterns = [
      /require\s*\(\s*['"]child_process['"]\s*\)/gi,
      /require\s*\(\s*['"]fs['"]\s*\)/gi,
      /require\s*\(\s*['"]os['"]\s*\)/gi,
      /require\s*\(\s*['"]crypto['"]\s*\)/gi,
      /require\s*\(\s*['"]net['"]\s*\)/gi,
      /require\s*\(\s*['"]http['"]\s*\)/gi,
      /require\s*\(\s*['"]https['"]\s*\)/gi,
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /process\./gi,
      /global\./gi,
      /Buffer\./gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new Error(`JavaScript code contains dangerous pattern: ${pattern.source}`);
      }
    }
  }

  private validateJavaCode(code: string): void {
    const dangerousPatterns = [
      /Runtime\.getRuntime\(\)/gi,
      /ProcessBuilder/gi,
      /System\.exit/gi,
      /System\.setProperty/gi,
      /File\s*\(/gi,
      /FileInputStream/gi,
      /FileOutputStream/gi,
      /Socket/gi,
      /ServerSocket/gi,
      /URL/gi,
      /URLConnection/gi,
      /HttpURLConnection/gi,
      /Class\.forName/gi,
      /ClassLoader/gi,
      /Reflection/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new Error(`Java code contains dangerous pattern: ${pattern.source}`);
      }
    }
  }

  private validateCppCode(code: string): void {
    const dangerousPatterns = [
      /#include\s*<sys\/stat\.h>/gi,
      /#include\s*<unistd\.h>/gi,
      /#include\s*<sys\/socket\.h>/gi,
      /#include\s*<netinet\/in\.h>/gi,
      /#include\s*<arpa\/inet\.h>/gi,
      /#include\s*<netdb\.h>/gi,
      /system\s*\(/gi,
      /exec\s*\(/gi,
      /fork\s*\(/gi,
      /popen\s*\(/gi,
      /socket\s*\(/gi,
      /connect\s*\(/gi,
      /bind\s*\(/gi,
      /listen\s*\(/gi,
      /accept\s*\(/gi,
      /send\s*\(/gi,
      /recv\s*\(/gi,
      /open\s*\(/gi,
      /creat\s*\(/gi,
      /unlink\s*\(/gi,
      /remove\s*\(/gi,
      /rename\s*\(/gi,
      /chmod\s*\(/gi,
      /chown\s*\(/gi,
      /getenv\s*\(/gi,
      /setenv\s*\(/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new Error(`C++ code contains dangerous pattern: ${pattern.source}`);
      }
    }
  }

  private runDocker(
    args: string[],
    input: string = '',
    timeout: number = 30000
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      console.log(`Running: docker ${args.join(' ')}`);

      const proc = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Disable dangerous environment variables
          PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        },
      });

      let stdout = '';
      let stderr = '';
      let isTimeout = false;
      const startTime = Date.now();

      // Set timeout
      const timer = setTimeout(() => {
        isTimeout = true;
        proc.kill('SIGKILL');
        reject(new Error('Execution timeout'));
      }, timeout);

      proc.stdout.on('data', data => {
        stdout += data.toString();
        // Prevent memory issues with large outputs
        if (stdout.length > this.securityConfig.maxOutputSize) {
          proc.kill('SIGKILL');
          clearTimeout(timer);
          reject(new Error('Output size limit exceeded'));
        }
      });

      proc.stderr.on('data', data => {
        stderr += data.toString();
        if (stderr.length > this.securityConfig.maxErrorSize) {
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

      // Input is now handled via file, so just close stdin
      proc.stdin.end();
    });
  }

  private trimOutput(output: string): string {
    return output.replace(/\r/g, '').replace(/\n+$/, '').trim();
  }

  private cleanupJobDir(jobDir: string, delay: number = 30000): void {
    setTimeout(() => {
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
        console.log(`Cleaned up job directory: ${jobDir}`);
      } catch (error) {
        console.warn(`Failed to cleanup ${jobDir}:`, error);
      }
    }, delay);
  }

  private async compileCode(jobDir: string, config: any, memoryLimit: string): Promise<void> {
    // Convert Windows path to Unix-style for Docker
    const absJobDir = path.resolve(jobDir).replace(/\\/g, '/');

    // Add drive letter handling for Windows (C: -> /c/)
    const dockerPath = absJobDir.replace(/^([A-Z]):/, (match, drive) => `/${drive.toLowerCase()}`);

    console.log(`Compiling in: ${dockerPath}`);

    // Use security service to generate secure Docker arguments
    const dockerArgs = securityService.generateSecureDockerArgs(
      config.image,
      config.compileCmd,
      memoryLimit,
      30, // 30 seconds timeout for compilation
      dockerPath
    );

    try {
      const result = await this.runDocker(dockerArgs, '', 30000);

      if (result.exitCode !== 0) {
        throw new Error(`Compilation failed: ${result.stderr}`);
      }

      console.log('✅ Compilation successful');
    } catch (error) {
      console.error('❌ Compilation error:', error);
      throw error;
    }
  }

  private async runCode(
    jobDir: string,
    config: any,
    input: string,
    timeLimit: number,
    memoryLimit: string
  ): Promise<ExecutionResult> {
    const absJobDir = path.resolve(jobDir).replace(/\\/g, '/');
    const dockerPath = absJobDir.replace(/^([A-Z]):/, (match, drive) => `/${drive.toLowerCase()}`);

    const actualTimeLimit = Math.min(timeLimit, config.timeout);

    console.log(`Running code with time limit: ${actualTimeLimit}s`);
    console.log(`Input provided: "${input}"`);

    // Create input file for Docker
    if (input) {
      const inputFile = path.join(jobDir, 'input.txt');
      fs.writeFileSync(inputFile, input, 'utf8');
      console.log(`Created input file: ${inputFile}`);
    }

    // Use input redirection instead of stdin
    const runCommand = input ? `${config.runCmd} < /work/input.txt` : config.runCmd;

    // Use security service to generate secure Docker arguments
    const dockerArgs = securityService.generateSecureDockerArgs(
      config.image,
      runCommand,
      memoryLimit,
      actualTimeLimit,
      dockerPath
    );

    console.log(`Docker command: docker ${dockerArgs.join(' ')}`);

    try {
      const result = await this.runDocker(dockerArgs, '', (actualTimeLimit + 2) * 1000);
      console.log(`Execution result - stdout: "${result.stdout}", stderr: "${result.stderr}"`);
      return result;
    } catch (error: any) {
      if (error.message.includes('timeout') || error.message.includes('Execution timeout')) {
        throw new Error('Time limit exceeded');
      } else {
        throw new Error(`Runtime error: ${error.message}`);
      }
    }
  }

  async executeBatch(config: ExecutionConfig): Promise<BatchExecutionResult> {
    const executionId = uuidv4();
    const jobDir = path.join(this.workspaceDir, executionId);
    const startTime = Date.now();

    try {
      // Validate code security before execution
      this.validateCodeSecurity(config.code, config.language);

      // Create job directory
      fs.mkdirSync(jobDir, { recursive: true });
      console.log(`Created job directory: ${jobDir}`);

      // Get language config
      const langConfig = languages[config.language as keyof typeof languages];
      if (!langConfig) {
        throw new Error(`Unsupported language: ${config.language}`);
      }

      const filePath = path.join(jobDir, langConfig.fileName);

      // Write code to file
      fs.writeFileSync(filePath, config.code, 'utf8');
      console.log(`Code written to: ${filePath}`);

      // Compile if needed
      if (langConfig.needsCompilation && langConfig.compileCmd) {
        console.log(`Compiling ${config.language} code...`);
        await this.compileCode(jobDir, langConfig, config.memoryLimit);
        console.log('Compilation successful');
      }

      // Execute each testcase
      const results: TestcaseResult[] = [];
      let passed = 0;

      for (let i = 0; i < config.testcases.length; i++) {
        const testcase = config.testcases[i];
        if (!testcase) {
          console.warn(`Testcase at index ${i} is undefined, skipping...`);
          continue;
        }

        const testStart = Date.now();

        console.log(`Running testcase ${i + 1}/${config.testcases.length}...`);

        try {
          console.log(`Testcase ${i + 1} input: "${testcase.input || ''}"`);
          const result = await this.runCode(
            jobDir,
            langConfig,
            testcase.input || '',
            config.timeLimit,
            config.memoryLimit
          );

          const expected = this.trimOutput(testcase.output || '');
          const actual = this.trimOutput(result.stdout || '');
          const ok = actual === expected;

          if (ok) passed++;

          results.push({
            index: i,
            input: testcase.input || '',
            expected,
            actual,
            ok,
            stderr: result.stderr || '',
            executionTime: Date.now() - testStart,
            error: result.exitCode !== 0 ? result.stderr : undefined,
          });

          console.log(`Testcase ${i + 1}: ${ok ? '✅ PASS' : '❌ FAIL'}`);
          if (!ok) {
            console.log(`  Expected: "${expected}"`);
            console.log(`  Actual: "${actual}"`);
          }
        } catch (error: any) {
          console.log(`Testcase ${i + 1}: ❌ ERROR - ${error.message}`);

          results.push({
            index: i,
            input: testcase.input || '',
            expected: testcase.output || '',
            actual: '',
            ok: false,
            error: error.message,
            executionTime: Date.now() - testStart,
            stderr: '',
          });
        }
      }

      const summary = {
        passed,
        total: config.testcases.length,
        successRate:
          config.testcases.length > 0
            ? ((passed / config.testcases.length) * 100).toFixed(2)
            : '0.00',
      };

      console.log(`Batch execution completed: ${passed}/${config.testcases.length} passed`);

      return {
        summary,
        results,
        processingTime: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error('Batch execution error:', error);
      throw error;
    } finally {
      // Cleanup after delay
      this.cleanupJobDir(jobDir);
    }
  }

  async testDocker(): Promise<boolean> {
    try {
      await this.runDocker(['--version'], '', 5000);
      console.log('✅ Docker is available');
      return true;
    } catch (error: any) {
      console.error('❌ Docker is not available:', error);
      return false;
    }
  }
}

// Singleton instance
export const codeExecutionService = new CodeExecutionService();
