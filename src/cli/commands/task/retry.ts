import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { retryTask } from "../../../application/task-operations.js";
export function registerTaskRetryCommand(task: Command): void {
  task
    .command("retry <spec> <taskId>")
    .description("Reset a failed or running task back to pending")
    .action((spec: string, taskId: string) => {
      const gw = new NodeWorkspaceGateway(process.cwd());
      const result = retryTask(gw, spec, taskId);

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
          console.error(
            `\n✗ Task is already completed. Use 'task reset' if you want to redo it.\n`,
          );
          process.exitCode = 1;
          break;
        case "retried":
          console.log(
            `\n✓ Task '${taskId}' for spec '${spec}' reset to pending. Run \`codeforge run ${spec}\` to re-execute.\n`,
          );
          break;
      }
    });
}
