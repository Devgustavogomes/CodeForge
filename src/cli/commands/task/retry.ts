import { Command } from "commander";
import { retryTask } from "../../../application/run-execution.js";

export function registerTaskRetryCommand(task: Command): void {
  task
    .command("retry <spec> <taskId>")
    .description("Reset a failed or running task back to pending")
    .action((spec: string, taskId: string) => {
      const workspacePath = process.cwd();
      const result = retryTask(workspacePath, spec, taskId);

      if (!result.success) {
        console.error(`\n✗ ${result.reason}\n`);
        process.exitCode = 1;
        return;
      }

      console.log(`\n✓ Task '${taskId}' for spec '${spec}' reset to pending. Run \`codeforge run ${spec}\` to re-execute.\n`);
    });
}
