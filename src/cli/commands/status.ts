import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../application/plan.js";
import { getSpecStatus, formatStatusOutput } from "../../application/status.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status [spec]")
    .description("Show execution progress for a spec")
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
          message: "Select a spec to view status:",
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      const result = getSpecStatus(workspacePath, specName);

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

      if (result.noExecution) {
        console.log(`\n○ No execution started for spec '${specName}'. Run \`codeforge run ${specName}\` to begin.\n`);
        return;
      }

      console.log(formatStatusOutput(result));
    });
}
