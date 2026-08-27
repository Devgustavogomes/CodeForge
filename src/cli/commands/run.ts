import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../application/plan.js";
import { runExecution } from "../../application/run-execution.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run [spec]")
    .description("Execute tasks for a given spec autonomously or manually")
    .action(async (spec?: string) => {
      const workspacePath = process.cwd();
      let specName = spec;

      if (!specName) {
        const specs = getAvailableSpecs(workspacePath);
        
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

      const result = runExecution(workspacePath, specName);
      
      if (result.notInitialized) {
        console.error("\n✗ CodeForge is not initialized. Run `codeforge init` first.\n");
        process.exitCode = 1;
        return;
      }

      if (result.specNotFound) {
        console.error(`\n✗ No tasks directory found for spec: ${specName}\n`);
        process.exitCode = 1;
        return;
      }

      if (result.finished) {
        console.log(`\n🎉 All tasks for spec '${specName}' have been completed successfully!\n`);
        return;
      }

      if (result.error) {
        console.error(`\n✗ Execution error: ${result.error}\n`);
        process.exitCode = 1;
        return;
      }

      if (result.manualTaskRequired) {
        console.log(`\n▶ Task ready for execution: ${result.manualTaskRequired}`);
        console.log(`\nContext prompt generated at: ${result.manualPromptPath}`);
        console.log(`\n[MANUAL ACTION REQUIRED]`);
        console.log(`1. Open a NEW, clean session in your AI agent.`);
        console.log(`2. Instruct the agent to read the prompt file.`);
        console.log(`3. When the agent finishes, run: \`codeforge task complete ${specName} ${result.manualTaskRequired}\``);
        console.log(`4. Run \`codeforge run ${specName}\` to get the next task.\n`);
        return;
      }
    });
}
