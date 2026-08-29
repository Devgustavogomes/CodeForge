import { Command } from "commander";
import { select } from "@inquirer/prompts";
import {
  getAvailableSpecs,
  preparePlanningPrompt,
} from "../../../application/plan.js";

export function registerPlanGenerateCommand(plan: Command): void {
  plan
    .command("generate [spec]")
    .description("Generate a planning prompt for an AI agent")
    .action(async (spec?: string) => {
      const workspacePath = process.cwd();
      let selectedSpec = spec;

      if (!selectedSpec) {
        const specs = getAvailableSpecs(workspacePath);

        if (specs.length === 0) {
          console.error(
            "\n✗ No specs found. Create one first using `codeforge spec create <name>`.\n",
          );
          process.exitCode = 1;
          return;
        }

        selectedSpec = await select({
          message: "Select a spec to generate a plan prompt for:",
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      const result = preparePlanningPrompt(workspacePath, selectedSpec);

      switch (result.kind) {
        case "not-initialized":
          console.error(
            "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n",
          );
          process.exitCode = 1;
          break;
        case "spec-not-found":
          console.error(`\n✗ Spec not found: ${selectedSpec}.md\n`);
          process.exitCode = 1;
          break;
        case "ready":
          // Output directly to stdout for the AI agent to consume
          console.log(result.prompt);
          break;
      }
    });
}
