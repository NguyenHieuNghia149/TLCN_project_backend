export type PreMergeGateCommand = {
  label: string;
  command: 'npm' | 'npx';
  args: string[];
};

export type PreMergeGateCommandResult = PreMergeGateCommand & {
  exitCode: number;
  passed: boolean;
};

export type PreMergeGateSummary = {
  checkedAt: string;
  overallStatus: 'pass' | 'fail';
  passedSteps: number;
  failedSteps: number;
  steps: PreMergeGateCommandResult[];
};

export type PreMergeGateInvocation = {
  executable: string;
  args: string[];
  shell: boolean;
};

/** Returns the deterministic command list required before any manual pre-merge runtime verification. */
export function getPreMergeGateCommands(): PreMergeGateCommand[] {
  return [
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
  ];
}

/** Resolves the child-process invocation strategy for the current platform. */
export function resolvePreMergeGateInvocation(
  command: PreMergeGateCommand,
  platform: NodeJS.Platform = process.platform,
): PreMergeGateInvocation {
  if (platform === 'win32') {
    return {
      executable: command.command,
      args: command.args,
      shell: true,
    };
  }

  return {
    executable: command.command,
    args: command.args,
    shell: false,
  };
}

/** Builds the stable JSON summary printed by the pre-merge gate runner. */
export function buildPreMergeGateSummary(input: {
  checkedAt: string;
  steps: PreMergeGateCommandResult[];
}): PreMergeGateSummary {
  const passedSteps = input.steps.filter(step => step.passed).length;
  const failedSteps = input.steps.length - passedSteps;

  return {
    checkedAt: input.checkedAt,
    overallStatus: failedSteps === 0 ? 'pass' : 'fail',
    passedSteps,
    failedSteps,
    steps: input.steps,
  };
}

/** Runs the configured pre-merge commands and returns the final deterministic summary. */
export function runPreMergeGateCommands(options: {
  checkedAt?: string;
  commands?: readonly PreMergeGateCommand[];
  runCommand: (command: PreMergeGateCommand) => PreMergeGateCommandResult;
}): PreMergeGateSummary {
  const commands = options.commands ?? getPreMergeGateCommands();
  const steps = commands.map(command => options.runCommand(command));

  return buildPreMergeGateSummary({
    checkedAt: options.checkedAt ?? new Date().toISOString(),
    steps,
  });
}
