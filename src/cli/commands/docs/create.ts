import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../../application/plan.js";
import { prepareDocsPrompt } from "../../../application/docs.js";

export function registerDocsCreateCommand(docs: Command): void {
  docs
    .command("create [spec]")
    .description("Generate documentation prompt for a completed spec")
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
          message: "Select a spec to generate documentation for:",
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      const result = prepareDocsPrompt(workspacePath, selectedSpec);

      if ("notInitialized" in result && result.notInitialized) {
        console.error(
          "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n",
        );
        process.exitCode = 1;
        return;
      }

      if ("specNotFound" in result && result.specNotFound) {
        console.error(`\n✗ Spec not found: ${selectedSpec}.md\n`);
        process.exitCode = 1;
        return;
      }

      if ("rulesNotFound" in result && result.rulesNotFound) {
        console.error(`\n✗ Documentation rules not found in .codeforge/rules/docs.md\n`);
        process.exitCode = 1;
        return;
      }

      if ("alreadyExists" in result && result.alreadyExists) {
        console.error(`\n✗ Documentation for '${selectedSpec}' already exists.\n  Use 'codeforge docs update ${selectedSpec}' in the future.\n`);
        process.exitCode = 1;
        return;
      }

      if ("prompt" in result && result.prompt) {
        console.log(result.prompt);
      }
    });
}
