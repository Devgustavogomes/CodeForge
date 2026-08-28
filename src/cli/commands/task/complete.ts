import { Command } from "commander";
import { markTaskCompleted } from "../../../application/run-execution.js";

export function registerTaskCompleteCommand(task: Command): void {
  task
    .command("complete <spec> <taskId>")
    .description("Mark a task as completed")
    .action((spec: string, taskId: string) => {
      const workspacePath = process.cwd();
      const success = markTaskCompleted(workspacePath, spec, taskId);
      
      if (!success) {
        console.error(`\n✗ Failed to mark task as completed. Check if spec '${spec}' is running and task '${taskId}' exists.\n`);
        process.exitCode = 1;
        return;
      }

      console.log(`\n✓ Task '${taskId}' for spec '${spec}' marked as completed.\n`);
    });
}
