jest.mock('@backend/shared/utils', () => ({
  FsUtils: {
    exists: jest.fn(),
    ensureDir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    chmod: jest.fn(),
    remove: jest.fn(),
  },
  StringUtils: {
    trimOutput: jest.fn((output: string) => String(output).trim()),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('yaml', () => ({
  parse: jest.fn(),
}));

jest.mock('@backend/shared/runtime/code-security', () => ({
  getSecurityService: jest.fn(),
}));

jest.mock('@backend/shared/runtime/code-monitoring', () => ({
  getMonitoringService: jest.fn(),
}));

import { FsUtils, StringUtils, logger } from '@backend/shared/utils';
import { getMonitoringService } from '@backend/shared/runtime/code-monitoring';
import { getSecurityService } from '@backend/shared/runtime/code-security';
import { ExecutionConfig } from '@backend/shared/validations/submission.validation';
import * as yaml from 'yaml';
import {
  SandboxConfig,
  SandboxService,
  createSandboxService,
} from '../../../apps/sandbox/src/sandbox.service';

type MockedFsUtils = {
  exists: jest.Mock;
  ensureDir: jest.Mock;
  readFile: jest.Mock;
  writeFile: jest.Mock;
  chmod: jest.Mock;
  remove: jest.Mock;
};

type MockedStringUtils = {
  trimOutput: jest.Mock;
};

type MockedLogger = {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

type SandboxServiceDependencies = ConstructorParameters<typeof SandboxService>[0];

const mockedFsUtils = FsUtils as unknown as MockedFsUtils;
const mockedStringUtils = StringUtils as unknown as MockedStringUtils;
const mockedLogger = logger as unknown as MockedLogger;
const mockedYamlParse = yaml.parse as jest.Mock;
const mockedGetSecurityService = getSecurityService as jest.Mock;
const mockedGetMonitoringService = getMonitoringService as jest.Mock;

function createSandboxConfig(maxConcurrent: number = 5): SandboxConfig {
  return {
    host: 'localhost',
    port: 4000,
    timeout: 30000,
    maxConcurrent,
  };
}

function createSecurityService() {
  return {
    validateCodeSecurity: jest.fn(),
  };
}

function createMonitoringService(events: Array<{ message: string }> = []) {
  return {
    detectMaliciousCode: jest.fn().mockReturnValue(events),
    logSecurityEvent: jest.fn(),
  };
}

function createExecutionConfig(): ExecutionConfig {
  return {
    code: 'print(1)',
    language: 'python',
    timeLimit: 1000,
    memoryLimit: '128m',
    testcases: [
      {
        id: 'tc-1',
        input: '',
        output: '1',
        point: 1,
      },
    ],
  };
}

function createTestService(
  overrides: Partial<SandboxServiceDependencies> = {},
): SandboxService {
  const deps: SandboxServiceDependencies = {
    config: createSandboxConfig(),
    workspaceDir: '/tmp/workspace',
    sandboxYamlPath: '/tmp/config/sandbox.yaml',
    securityService: createSecurityService(),
    monitoringService: createMonitoringService(),
    ...overrides,
  };

  return new SandboxService(deps);
}

describe('sandbox service dependency composition', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    mockedFsUtils.exists.mockImplementation((target: string) => target.endsWith('sandbox.yaml'));
    mockedFsUtils.ensureDir.mockImplementation(() => undefined);
    mockedFsUtils.readFile.mockReturnValue('judge:\n  languages: []');
    mockedFsUtils.writeFile.mockImplementation(() => undefined);
    mockedFsUtils.chmod.mockImplementation(() => undefined);
    mockedFsUtils.remove.mockImplementation(() => undefined);
    mockedStringUtils.trimOutput.mockImplementation((output: string) => String(output).trim());
    mockedYamlParse.mockReturnValue({ judge: { languages: [] } });
    mockedLogger.info.mockImplementation(() => undefined);
    mockedLogger.warn.mockImplementation(() => undefined);
    mockedLogger.error.mockImplementation(() => undefined);
    mockedGetSecurityService.mockReturnValue(createSecurityService());
    mockedGetMonitoringService.mockReturnValue(createMonitoringService());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('executeCode calls the injected security service with the request code and language', async () => {
    const securityService = createSecurityService();
    const monitoringService = createMonitoringService();
    const service = createTestService({ securityService, monitoringService });

    (service as any).createIsolatedWorkspace = jest.fn().mockResolvedValue(undefined);
    (service as any).executeInSandbox = jest.fn().mockResolvedValue({
      summary: {
        passed: 1,
        total: 1,
        successRate: '100.00',
        status: 'ACCEPTED',
      },
      results: [],
    });
    (service as any).cleanupWorkspace = jest.fn();

    await service.executeCode(createExecutionConfig());

    expect(securityService.validateCodeSecurity).toHaveBeenCalledWith('print(1)', 'python');
  });

  it('returns an error and logs each monitoring event when malicious code is detected', async () => {
    const securityService = createSecurityService();
    const monitoringService = createMonitoringService([
      { message: 'Fork bomb detected' },
      { message: 'Socket creation detected' },
    ]);
    const service = createTestService({ securityService, monitoringService });

    (service as any).cleanupWorkspace = jest.fn();

    const result = await service.executeCode(createExecutionConfig());

    expect(securityService.validateCodeSecurity).toHaveBeenCalledWith('print(1)', 'python');
    expect(monitoringService.logSecurityEvent).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      success: false,
      error: 'Code contains malicious patterns: Fork bomb detected',
    });
  });

  it('getStatus reflects the injected maxConcurrent config', () => {
    const service = createTestService({
      config: createSandboxConfig(9),
    });

    expect(service.getStatus()).toMatchObject({
      activeJobs: 0,
      maxConcurrent: 9,
      isHealthy: true,
    });
  });

  it('healthCheck reflects whether the injected workspace path exists', async () => {
    const workspaceDir = '/custom/workspace';
    mockedFsUtils.exists.mockImplementation((target: string) => target === workspaceDir);
    const service = createTestService({
      workspaceDir,
      sandboxYamlPath: '/custom/config/sandbox.yaml',
    });

    await expect(service.healthCheck()).resolves.toBe(true);
  });

  it('createSandboxService returns fresh instances and uses the default runtime providers', () => {
    process.env.SANDBOX_MAX_CONCURRENT = '9';
    process.env.WORKSPACE_DIR = '/factory/workspace';

    const firstSecurityService = createSecurityService();
    const secondSecurityService = createSecurityService();
    const firstMonitoringService = createMonitoringService();
    const secondMonitoringService = createMonitoringService();

    mockedGetSecurityService
      .mockReturnValueOnce(firstSecurityService)
      .mockReturnValueOnce(secondSecurityService);
    mockedGetMonitoringService
      .mockReturnValueOnce(firstMonitoringService)
      .mockReturnValueOnce(secondMonitoringService);
    mockedFsUtils.exists.mockImplementation((target: string) => target.endsWith('sandbox.yaml'));

    const first = createSandboxService();
    const second = createSandboxService();

    expect(first).toBeInstanceOf(SandboxService);
    expect(second).toBeInstanceOf(SandboxService);
    expect(first).not.toBe(second);
    expect(first.getStatus().maxConcurrent).toBe(9);
    expect(second.getStatus().maxConcurrent).toBe(9);
    expect(mockedGetSecurityService).toHaveBeenCalledTimes(2);
    expect(mockedGetMonitoringService).toHaveBeenCalledTimes(2);
    expect(mockedFsUtils.ensureDir).toHaveBeenCalledWith('/factory/workspace');
  });
});
