import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { TaskOperationsUseCase } from "../../../application/use-cases/TaskOperationsUseCase.js";

export function registerTaskRetryCommand(task: Command): void {
  task
    .command("retry <spec-name> <task-id>")
    .description("Mark a completed or failed task as pending to be run again")
    .action((specName: string, taskId: string) => {
      const gw = new NodeWorkspaceGateway(process.cwd());
      
      const useCase = new TaskOperationsUseCase(gw);
      const result = useCase.retryTask(specName, taskId);

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
            `\n✓ Task '${taskId}' for spec '${specName}' reset to pending. Run \`codeforge run ${specName}\` to re-execute.\n`,
          );
          break;
      }
    });
}
