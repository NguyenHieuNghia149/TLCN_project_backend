import {
  buildPreMergeGateSummary,
  getPreMergeGateCommands,
  resolvePreMergeGateInvocation,
  runPreMergeGateCommands,
  type PreMergeGateCommandResult,
} from '../../../scripts/verify/pre-merge-gate.shared';

describe('pre-merge gate helper', () => {
  it('returns the deterministic pre-merge commands in the expected order', () => {
    expect(getPreMergeGateCommands()).toEqual([
      {
        label: 'verify:release-smoke',
        command: 'npm',
        args: ['run', 'verify:release-smoke'],
      },
      {
        label: 'check:refactor-guards',
        command: 'npm',
        args: ['run', 'check:refactor-guards'],
      },
      {
        label: 'check:no-testcase-text-cache-refs',
        command: 'npm',
        args: ['run', 'check:no-testcase-text-cache-refs'],
      },
      {
        label: 'typecheck',
        command: 'npx',
        args: ['tsc', '-p', 'tsconfig.json', '--noEmit'],
      },
      {
        label: 'build',
        command: 'npm',
        args: ['run', 'build'],
      },
    ]);
  });

  it('uses shell execution on Windows to avoid cmd spawn errors', () => {
    expect(
      resolvePreMergeGateInvocation(
        {
          label: 'verify:release-smoke',
          command: 'npm',
          args: ['run', 'verify:release-smoke'],
        },
        'win32',
      ),
    ).toEqual({
      executable: 'npm',
      args: ['run', 'verify:release-smoke'],
      shell: true,
    });
  });

  it('marks the summary as failed when any step fails', () => {
    const summary = buildPreMergeGateSummary({
      checkedAt: '2026-03-24T00:00:00.000Z',
      steps: [
        {
          label: 'verify:release-smoke',
          command: 'npm',
          args: ['run', 'verify:release-smoke'],
          exitCode: 0,
          passed: true,
        },
        {
          label: 'build',
          command: 'npm',
          args: ['run', 'build'],
          exitCode: 1,
          passed: false,
        },
      ],
    });

    expect(summary).toEqual({
      checkedAt: '2026-03-24T00:00:00.000Z',
      overallStatus: 'fail',
      passedSteps: 1,
      failedSteps: 1,
      steps: [
        {
          label: 'verify:release-smoke',
          command: 'npm',
          args: ['run', 'verify:release-smoke'],
          exitCode: 0,
          passed: true,
        },
        {
          label: 'build',
          command: 'npm',
          args: ['run', 'build'],
          exitCode: 1,
          passed: false,
        },
      ],
    });
  });

  it('runs every step and keeps later failures in the final summary', () => {
    const executor = jest
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 1 })
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 });

    const summary = runPreMergeGateCommands({
      checkedAt: '2026-03-24T00:00:00.000Z',
      runCommand: command => {
        const result = executor(command) as { status?: number | null };
        return {
          label: command.label,
          command: command.command,
          args: command.args,
          exitCode: result.status ?? 1,
          passed: (result.status ?? 1) === 0,
        } satisfies PreMergeGateCommandResult;
      },
    });

    expect(executor).toHaveBeenCalledTimes(5);
    expect(summary.overallStatus).toBe('fail');
    expect(summary.failedSteps).toBe(1);
    expect(summary.steps.map(step => step.label)).toEqual([
      'verify:release-smoke',
      'check:refactor-guards',
      'check:no-testcase-text-cache-refs',
      'typecheck',
      'build',
    ]);
  });
});
