import { spawnSync } from 'node:child_process';

import {
  resolvePreMergeGateInvocation,
  runPreMergeGateCommands,
  type PreMergeGateCommand,
  type PreMergeGateCommandResult,
} from './pre-merge-gate.shared';

/** Executes one pre-merge gate command and forwards its output to the current terminal. */
function executeCommand(command: PreMergeGateCommand): PreMergeGateCommandResult {
  const invocation = resolvePreMergeGateInvocation(command);
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: process.cwd(),
    shell: invocation.shell,
    stdio: 'inherit',
  });

  return {
    label: command.label,
    command: command.command,
    args: command.args,
    exitCode: result.status ?? 1,
    passed: (result.status ?? 1) === 0,
  };
}

async function main(): Promise<void> {
  const summary = runPreMergeGateCommands({
    runCommand: executeCommand,
  });

  console.log(JSON.stringify(summary, null, 2));

  if (summary.overallStatus !== 'pass') {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
