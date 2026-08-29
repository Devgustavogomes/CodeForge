import { Command } from "commander";
import { select, input } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../../application/plan.js";
import { prepareDocsPrompt } from "../../../application/docs.js";

export function registerDocsCreateCommand(docs: Command): void {
  docs
    .command("create [doc-name]")
    .description("Generate documentation prompt for a completed spec")
    .option("--spec <spec>", "Name of the spec to associate with the documentation")
    .action(async (docName?: string, options?: { spec?: string }) => {
      const workspacePath = process.cwd();

      if (!docName) {
        docName = await input({
          message: "Enter the documentation name:",
        });

        if (!docName || docName.trim().length === 0) {
          console.error("\n✗ Documentation name cannot be empty.\n");
          process.exitCode = 1;
          return;
        }

        docName = docName.trim();
      }

      let selectedSpec = options?.spec;

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
          message: "Select a spec to associate with this documentation:",
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      const result = prepareDocsPrompt(workspacePath, docName, selectedSpec);

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
        case "rules-not-found":
          console.error(`\n✗ Documentation rules not found in .codeforge/rules/docs.md\n`);
          process.exitCode = 1;
          break;
        case "already-exists":
          console.error(`\n✗ Documentation '${docName}' already exists.\n  Use 'codeforge docs update' in the future.\n`);
          process.exitCode = 1;
          break;
        case "prompt":
          console.log(result.prompt);
          break;
      }
    });
}

