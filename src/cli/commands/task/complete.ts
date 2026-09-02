import { Command } from "commander";
import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { TaskOperationsUseCase } from "../../../application/use-cases/TaskOperationsUseCase.js";

export function registerTaskCompleteCommand(task: Command): void {
  task
    .command("complete <spec-name> <task-id>")
    .description("Mark a specific task as completed manually")
    .action((specName: string, taskId: string) => {
      const gw = new NodeWorkspaceGateway(process.cwd());
      
      const useCase = new TaskOperationsUseCase(gw);
      const result = useCase.markTaskCompleted(specName, taskId);

      switch (result.kind) {
        case "not-found":
          console.error(
            `\n✗ Failed to mark task as completed. Check if spec '${specName}' is running and task '${taskId}' exists.\n`,
          );
          process.exitCode = 1;
          break;
        case "completed":
          console.log(
            `\n✓ Task '${taskId}' for spec '${specName}' marked as completed.`,
          );
          if (result.allCompleted) {
            console.log(
              `\n🎉 All tasks for spec '${specName}' are completed! Execution status updated to 'completed'.\n`,
            );
          } else {
            console.log(
              `\n💡 Tip: Open a NEW, clean session in your AI agent before starting the next task.`,
            );
            console.log(
              `Then, run \`codeforge run ${specName}\` to get the next task.\n`,
            );
          }
          break;
      }
    });
}
