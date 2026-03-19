describe('shared runtime code-service lazy initialization', () => {
  beforeEach(() => {
    jest.resetModules();
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
});
