import fs from "node:fs";
import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { select, confirm } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../../application/plan.js";
import {
  prepareDocsUpdatePrompt,
  buildDocUpdatePrompt,
  prepareManualDocUpdate,
  buildDocManualUpdatePrompt,
} from "../../../application/docs.js";
import { ConfigService } from "../../../config/ConfigService.js";
import { RunnerFactory } from "../../../runners/RunnerFactory.js";
import { TaskContext } from "../../../runners/AgentRunner.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";

export function registerDocsUpdateCommand(docs: Command): void {
  docs
    .command("update [spec]")
    .description("Update documentation autonomously affected by changes from a spec execution")
    .option("--doc <doc>", "Manually specify which doc to update (skips scope matching)")
    .action(async (spec?: string, options?: { doc?: string }) => {
      const gw = new NodeWorkspaceGateway(process.cwd());

      const configService = new ConfigService(gw);
      const config = configService.loadConfig();
      if (!config) {
        console.error(
          "\n✗ CodeForge is not configured. Run `codeforge init` first.\n",
        );
        process.exitCode = 1;
        return;
      }

      let selectedSpec = spec;

      if (!selectedSpec) {
        const specs = getAvailableSpecs(gw);

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

      const runner = RunnerFactory.createRunner(config.environment);
      const docsDir = ".codeforge/docs";
      if (!gw.exists(docsDir)) {
        gw.mkdir(docsDir);
      }

      // Helper function to execute prompt
      const executeDocUpdate = async (docName: string, promptStr: string) => {
        const promptPath = `${docsDir}/${docName}-update.temp.prompt.md`;
        gw.writeFile(promptPath, promptStr);

        const context: TaskContext = {
          promptFilePath: promptPath,
          specName: selectedSpec!,
          model: config.plannerAgent,
          silent: true,
        };

        const ui = new AgentProgressUI(`Updating ${docName}...`, config.plannerAgent);
        console.log(`\n▶ Updating documentation '${docName}'...`);
        ui.init();
        ui.start();

        try {
          await runner.execute(context);
          ui.stop(true, "Docs updated");
        } catch (error) {
          ui.stop(false, "Failed");
          if (error instanceof Error) {
            console.error(`  ${error.message}`);
          } else {
            console.error(error);
          }
          process.exitCode = 1;
        } finally {
          if (fs.existsSync(promptPath)) {
            fs.unlinkSync(promptPath);
          }
        }
      };

      // ── Manual mode: user explicitly specified --doc <docname> ──────────────
      if (options?.doc) {
        const result = prepareManualDocUpdate(gw, selectedSpec, options.doc);

        switch (result.kind) {
          case "not-initialized":
            console.error(
              "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n",
            );
            process.exitCode = 1;
            return;
          case "spec-not-found":
            console.error(`\n✗ Spec not found: ${selectedSpec}.md\n`);
            process.exitCode = 1;
            return;
          case "rules-not-found":
            console.error(
              `\n✗ Documentation update rules not found in .codeforge/rules/docs-update.md\n  Run 'codeforge init' to regenerate rules.\n`,
            );
            process.exitCode = 1;
            return;
          case "doc-not-found":
            console.error(
              `\n✗ Doc '${options.doc}' not found. Check the name or use 'codeforge docs update' to let the manifest decide.\n`,
            );
            process.exitCode = 1;
            return;
          case "doc": {
            const prompt = buildDocManualUpdatePrompt(gw, selectedSpec, result.doc);
            await executeDocUpdate(options.doc, prompt);
            return;
          }
        }
      }

      // ── Automatic mode: scope-based manifest matching (default) ─────────────

      const result = prepareDocsUpdatePrompt(gw, selectedSpec);

      switch (result.kind) {
        case "not-initialized":
          console.error(
            "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n",
          );
          process.exitCode = 1;
          return;
        case "spec-not-found":
          console.error(`\n✗ Spec not found: ${selectedSpec}.md\n`);
          process.exitCode = 1;
          return;
        case "rules-not-found":
          console.error(
            `\n✗ Documentation update rules not found in .codeforge/rules/docs-update.md\n  Run 'codeforge init' to regenerate rules.\n`,
          );
          process.exitCode = 1;
          return;
        case "no-git":
          console.error(
            "\n✗ Git repository not found. docs update requires git to detect changes.\n",
          );
          process.exitCode = 1;
          return;
        case "no-changed-files":
          console.error(
            "\n✗ No changed files detected. Make sure you have uncommitted changes.\n",
          );
          process.exitCode = 1;
          return;
        case "no-affected-docs":
          console.error(
            `\n✗ No documentation affected by changes in '${selectedSpec}'.\n`,
          );
          process.exitCode = 1;
          return;
        case "affected-docs":
          break; // proceed below
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
          gw,
          selectedSpec,
          selectedDoc,
        );

        await executeDocUpdate(selectedDocName, prompt);

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
