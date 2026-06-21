const { buildChildEnv, resolveCommand } = require('../../../scripts/run-with-env');

describe('run-with-env launcher helpers', () => {
  it('loads dotenv values into the child process environment before Node starts', () => {
    const env = buildChildEnv(
      {
        PATH: 'system-path',
        UV_THREADPOOL_SIZE: undefined,
      },
      {
        UV_THREADPOOL_SIZE: '32',
        DB_POOL_MAX: '50',
      },
    );

    expect(env.UV_THREADPOOL_SIZE).toBe('32');
    expect(env.DB_POOL_MAX).toBe('50');
    expect(env.PATH).toBe('system-path');
  });

  it('lets the shell environment override dotenv defaults', () => {
    const env = buildChildEnv(
      {
        UV_THREADPOOL_SIZE: '64',
      },
      {
        UV_THREADPOOL_SIZE: '32',
      },
    );

    expect(env.UV_THREADPOOL_SIZE).toBe('64');
  });

  it('resolves Windows package binaries without using shell argument parsing', () => {
    const resolved = resolveCommand('ts-node', {
      env: {
        PATH: ['C:\\missing', 'D:\\Workspace\\backend\\node_modules\\.bin'].join(';'),
        PATHEXT: '.EXE;.CMD',
      },
      platform: 'win32',
      fileExists: (candidate: string) =>
        candidate.toLowerCase() ===
        'd:\\workspace\\backend\\node_modules\\.bin\\ts-node.cmd',
    });

    expect(resolved).toBe('D:\\Workspace\\backend\\node_modules\\.bin\\ts-node.CMD');
  });
});
