import { Command } from "commander";
import { select, confirm } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../../application/plan.js";
import {
  prepareDocsUpdatePrompt,
  buildDocUpdatePrompt,
} from "../../../application/docs.js";

export function registerDocsUpdateCommand(docs: Command): void {
  docs
    .command("update [spec]")
    .description("Update documentation affected by changes from a spec execution")
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
          message: "Select the spec that was executed (caused changes):",
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      const result = prepareDocsUpdatePrompt(workspacePath, selectedSpec);

      if ("notInitialized" in result) {
        console.error(
          "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n",
        );
        process.exitCode = 1;
        return;
      }

      if ("specNotFound" in result) {
        console.error(`\n✗ Spec not found: ${selectedSpec}.md\n`);
        process.exitCode = 1;
        return;
      }

      if ("rulesNotFound" in result) {
        console.error(
          `\n✗ Documentation update rules not found in .codeforge/rules/docs-update.md\n  Run 'codeforge init' to regenerate rules.\n`,
        );
        process.exitCode = 1;
        return;
      }

      if ("noGit" in result) {
        console.error(
          "\n✗ Git repository not found. docs update requires git to detect changes.\n",
        );
        process.exitCode = 1;
        return;
      }

      if ("noChangedFiles" in result) {
        console.error(
          "\n✗ No changed files detected. Make sure you have uncommitted changes.\n",
        );
        process.exitCode = 1;
        return;
      }

      if ("noAffectedDocs" in result) {
        console.error(
          `\n✗ No documentation affected by changes in '${selectedSpec}'.\n`,
        );
        process.exitCode = 1;
        return;
      }

      const { affectedDocs } = result;

      console.log(
        `\n📋 ${affectedDocs.length} doc(s) potentially affected:\n`,
      );
      for (const doc of affectedDocs) {
        console.log(
          `   • ${doc.docName} (matched: ${doc.matchedFiles.join(", ")})`,
        );
      }
      console.log();

      let remaining = [...affectedDocs];

      while (remaining.length > 0) {
        const choices = remaining.map((doc) => ({
          name: `${doc.docName} (${doc.matchedFiles.length} file(s) changed)`,
          value: doc.docName,
        }));

        const selectedDocName = await select({
          message: "Select a doc to update:",
          choices,
        });

        const selectedDoc = remaining.find(
          (d) => d.docName === selectedDocName,
        );
        if (!selectedDoc) break;

        const prompt = buildDocUpdatePrompt(
          workspacePath,
          selectedSpec,
          selectedDoc,
        );

        console.log(prompt);

        remaining = remaining.filter((d) => d.docName !== selectedDocName);

        if (remaining.length > 0) {
          const continueProcessing = await confirm({
            message: `Process another doc? (${remaining.length} remaining)`,
            default: true,
          });

          if (!continueProcessing) break;
        }
      }
    });
}
