const mockCreateLogger = jest.fn();
const mockConsoleTransport = jest.fn();
const mockColorize = jest.fn();
const mockTimestamp = jest.fn();
const mockPrintf = jest.fn();
const mockErrors = jest.fn();
const mockJson = jest.fn();
const mockCombine = jest.fn();
const mockDailyRotateFile = jest.fn();
let mockLoggerId = 0;
let mockFormatId = 0;

mockCreateLogger.mockImplementation(options => ({
  kind: 'logger',
  id: `logger-${++mockLoggerId}`,
  options,
}));
mockConsoleTransport.mockImplementation(function MockConsoleTransport(options) {
  return { kind: 'console-transport', options };
});
mockColorize.mockImplementation(options => ({ kind: 'colorize', options }));
mockTimestamp.mockImplementation(options => ({ kind: 'timestamp', options }));
mockPrintf.mockImplementation(formatter => ({ kind: 'printf', formatter }));
mockErrors.mockImplementation(options => ({ kind: 'errors', options }));
mockJson.mockImplementation(() => ({ kind: 'json' }));
mockCombine.mockImplementation((...args) => ({ kind: 'combine', id: `format-${++mockFormatId}`, args }));
mockDailyRotateFile.mockImplementation(function MockDailyRotateFile(options) {
  return { kind: 'daily-rotate-transport', options };
});

jest.mock('winston', () => ({
  __esModule: true,
  default: {
    format: {
      colorize: mockColorize,
      timestamp: mockTimestamp,
      printf: mockPrintf,
      errors: mockErrors,
      json: mockJson,
      combine: mockCombine,
    },
    transports: {
      Console: mockConsoleTransport,
    },
    createLogger: mockCreateLogger,
  },
}));

jest.mock('winston-daily-rotate-file', () => ({
  __esModule: true,
  default: mockDailyRotateFile,
}));

const originalEnv = { ...process.env };

type LoggerModule = typeof import('@backend/shared/utils/logger');

function applyEnv(overrides: Record<string, string | undefined>): void {
  process.env = { ...originalEnv };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

function loadLoggerModule(overrides: Record<string, string | undefined> = {}): LoggerModule {
  let loggerModule!: LoggerModule;
  applyEnv(overrides);

  jest.isolateModules(() => {
    loggerModule = require('@backend/shared/utils/logger');
  });

  return loggerModule;
}

describe('logger utils', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockLoggerId = 0;
    mockFormatId = 0;
    applyEnv({});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('createLogger returns a fresh logger instance on each call', () => {
    const loggerModule = loadLoggerModule({
      NODE_ENV: 'development',
      LOG_TO_FILE: 'false',
      LOG_LEVEL: 'debug',
    });

    mockCreateLogger.mockClear();

    const first = loggerModule.createLogger();
    const second = loggerModule.createLogger();

    expect(first).not.toBe(second);
    expect(mockCreateLogger).toHaveBeenCalledTimes(2);
  });

  it('uses the development console format and skips file transports by default in development', () => {
    loadLoggerModule({
      NODE_ENV: 'development',
      LOG_TO_FILE: 'false',
    });

    const consoleOptions = mockConsoleTransport.mock.calls[0][0] as { format: { args: Array<{ kind: string }> } };
    const consoleFormatKinds = consoleOptions.format.args.map(arg => arg.kind);

    expect(consoleFormatKinds).toContain('colorize');
    expect(mockDailyRotateFile).not.toHaveBeenCalled();
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
        exitOnError: false,
      }),
    );
  });

  it('uses the production console format and enables file transports when logging to file is active', () => {
    loadLoggerModule({
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      LOG_DIR: 'D:/tmp/logs',
    });

    const consoleOptions = mockConsoleTransport.mock.calls[0][0] as { format: { args: Array<{ kind: string }> } };
    const consoleFormatKinds = consoleOptions.format.args.map(arg => arg.kind);

    expect(consoleFormatKinds).not.toContain('colorize');
    expect(mockDailyRotateFile).toHaveBeenCalledTimes(2);
    expect(mockDailyRotateFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        dirname: 'D:/tmp/logs',
        filename: 'application-%DATE%.log',
        level: 'info',
      }),
    );
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warn',
        exitOnError: false,
      }),
    );
  });

  it('getLogger returns the cached singleton instance', () => {
    const loggerModule = loadLoggerModule({
      NODE_ENV: 'development',
      LOG_TO_FILE: 'false',
    });

    const exportedLogger = loggerModule.logger;
    mockCreateLogger.mockClear();

    const first = loggerModule.getLogger();
    const second = loggerModule.getLogger();

    expect(first).toBe(second);
    expect(first).toBe(exportedLogger);
    expect(mockCreateLogger).not.toHaveBeenCalled();
  });

  it('exposes the same singleton through both named and default exports', () => {
    const loggerModule = loadLoggerModule({
      NODE_ENV: 'development',
      LOG_TO_FILE: 'false',
    });

    expect(loggerModule.logger).toBeDefined();
    expect(loggerModule.default).toBe(loggerModule.logger);
  });
});