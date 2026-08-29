import { Command } from "commander";
import { retryTask } from "../../../application/run-execution.js";

export function registerTaskRetryCommand(task: Command): void {
  task
    .command("retry <spec> <taskId>")
    .description("Reset a failed or running task back to pending")
    .action((spec: string, taskId: string) => {
      const workspacePath = process.cwd();
      const result = retryTask(workspacePath, spec, taskId);

      switch (result.kind) {
        case "not-found":
          console.error(`\n✗ Task or spec execution not found.\n`);
          process.exitCode = 1;
          break;
        case "already-pending":
          console.error(`\n✗ Task is already pending.\n`);
          process.exitCode = 1;
          break;
        case "already-completed":
          console.error(`\n✗ Task is already completed. Use 'task reset' if you want to redo it.\n`);
          process.exitCode = 1;
          break;
        case "retried":
          console.log(`\n✓ Task '${taskId}' for spec '${spec}' reset to pending. Run \`codeforge run ${spec}\` to re-execute.\n`);
          break;
      }
    });
}
