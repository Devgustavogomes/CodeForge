import { NodeWorkspaceGateway } from "../../infrastructure/workspace.js";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../application/plan.js";
import { runExecution } from "../../application/run-execution.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run [spec]")
    .description("Execute tasks for a given spec autonomously or manually")
    .action(async (spec?: string) => {
      const gw = new NodeWorkspaceGateway(process.cwd());
      let specName = spec;

      if (!specName) {
        const specs = getAvailableSpecs(gw);
        
        if (specs.length === 0) {
          console.error("\n✗ No specs found.\n");
          process.exitCode = 1;
          return;
        }

        specName = await select({
          message: "Select a spec to execute:",
          choices: specs.map(s => ({ name: s, value: s }))
        });
      }

      const result = runExecution(gw, specName);
      
      switch (result.kind) {
        case "not-initialized":
          console.error("\n✗ CodeForge is not initialized. Run `codeforge init` first.\n");
          process.exitCode = 1;
          break;
        case "spec-not-found":
          console.error(`\n✗ No tasks directory found for spec: ${specName}\n`);
          process.exitCode = 1;
          break;
        case "finished":
          console.log(`\n🎉 All tasks for spec '${specName}' have been completed successfully!\n`);
          break;
        case "error":
          console.error(`\n✗ Execution error: ${result.message}\n`);
          process.exitCode = 1;
          break;
        case "task-ready":
          console.log(`\n▶ Task ready for execution: ${result.taskId}`);
          console.log(`\n🤖 AI Agent Instructions:`);
          console.log(`Please read the prompt file generated at: ${result.promptPath}`);
          console.log(`Follow the instructions inside it to execute the task.`);
          console.log(`When you are finished, run the following command to mark the task as completed:`);
          console.log(`\`codeforge task complete ${specName} ${result.taskId}\`\n`);
          break;
      }
    });
}
