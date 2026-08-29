import { Command } from "commander";
import { markTaskCompleted } from "../../../application/run-execution.js";

export function registerTaskCompleteCommand(task: Command): void {
  task
    .command("complete <spec> <taskId>")
    .description("Mark a task as completed")
    .action((spec: string, taskId: string) => {
      const workspacePath = process.cwd();
      const result = markTaskCompleted(workspacePath, spec, taskId);
      
      switch (result.kind) {
        case "not-found":
          console.error(`\n✗ Failed to mark task as completed. Check if spec '${spec}' is running and task '${taskId}' exists.\n`);
          process.exitCode = 1;
          break;
        case "completed":
          console.log(`\n✓ Task '${taskId}' for spec '${spec}' marked as completed.`);
          if (result.allCompleted) {
            console.log(`\n🎉 All tasks for spec '${spec}' are completed! Execution status updated to 'completed'.\n`);
          } else {
            console.log();
          }
          break;
      }
    });
}
