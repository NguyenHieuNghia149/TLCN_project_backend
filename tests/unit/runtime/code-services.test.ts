describe('shared runtime code-service lazy initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.dontMock('fs');
  });

  it('does not touch the filesystem when importing code-security and initializes on first access', () => {
    const existsSync = jest.fn().mockReturnValue(false);
    const mkdirSync = jest.fn();
    const writeFileSync = jest.fn();

    jest.doMock('fs', () => ({
      existsSync,
      mkdirSync,
      writeFileSync,
      rmSync: jest.fn(),
    }));

    jest.isolateModules(() => {
      const runtime = require('../../../packages/shared/runtime/code-security');

      expect(mkdirSync).not.toHaveBeenCalled();
      expect(writeFileSync).not.toHaveBeenCalled();

      const first = runtime.getSecurityService();
      const second = runtime.getSecurityService();

      expect(first).toBe(second);
      expect(mkdirSync).toHaveBeenCalledTimes(1);
      expect(writeFileSync).toHaveBeenCalledTimes(1);
    });
  });

  it('createCodeSecurityService returns fresh instances and initializes each construction', () => {
    const existsSync = jest.fn().mockReturnValue(false);
    const mkdirSync = jest.fn();
    const writeFileSync = jest.fn();

    jest.doMock('fs', () => ({
      existsSync,
      mkdirSync,
      writeFileSync,
      rmSync: jest.fn(),
    }));

    jest.isolateModules(() => {
      const runtime = require('../../../packages/shared/runtime/code-security');

      const first = runtime.createCodeSecurityService();
      const second = runtime.createCodeSecurityService();

      expect(first).toBeInstanceOf(runtime.CodeSecurityService);
      expect(second).toBeInstanceOf(runtime.CodeSecurityService);
      expect(first).not.toBe(second);
      expect(mkdirSync).toHaveBeenCalledTimes(2);
      expect(mkdirSync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('security'),
        { recursive: true },
      );
      expect(writeFileSync).toHaveBeenCalledTimes(2);
      expect(writeFileSync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('seccomp.json'),
        expect.any(String),
      );
    });
  });

  it('does not touch the filesystem when importing code-monitoring and initializes on first access', () => {
    const existsSync = jest.fn().mockReturnValue(false);
    const mkdirSync = jest.fn();

    jest.doMock('fs', () => ({
      existsSync,
      mkdirSync,
      appendFileSync: jest.fn(),
      readdirSync: jest.fn().mockReturnValue([]),
      statSync: jest.fn(),
      unlinkSync: jest.fn(),
      writeFileSync: jest.fn(),
    }));

    jest.isolateModules(() => {
      const runtime = require('../../../packages/shared/runtime/code-monitoring');

      expect(mkdirSync).not.toHaveBeenCalled();

      const first = runtime.getMonitoringService();
      const second = runtime.getMonitoringService();

      expect(first).toBe(second);
      expect(mkdirSync).toHaveBeenCalledTimes(1);
    });
  });

  it('createCodeMonitoringService returns fresh instances and initializes each construction', () => {
    const existsSync = jest.fn().mockReturnValue(false);
    const mkdirSync = jest.fn();

    jest.doMock('fs', () => ({
      existsSync,
      mkdirSync,
      appendFileSync: jest.fn(),
      readdirSync: jest.fn().mockReturnValue([]),
      statSync: jest.fn(),
      unlinkSync: jest.fn(),
      writeFileSync: jest.fn(),
    }));

    jest.isolateModules(() => {
      const runtime = require('../../../packages/shared/runtime/code-monitoring');

      const first = runtime.createCodeMonitoringService();
      const second = runtime.createCodeMonitoringService();

      expect(first).toBeInstanceOf(runtime.CodeMonitoringService);
      expect(second).toBeInstanceOf(runtime.CodeMonitoringService);
      expect(first).not.toBe(second);
      expect(mkdirSync).toHaveBeenCalledTimes(2);
      expect(mkdirSync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('logs'),
        { recursive: true },
      );
    });
  });
});
