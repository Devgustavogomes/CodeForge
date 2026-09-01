import fs from "node:fs";
import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { select, input } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../../application/plan.js";
import { prepareDocsPrompt } from "../../../application/docs.js";
import { ConfigService } from "../../../config/ConfigService.js";
import { RunnerFactory } from "../../../runners/RunnerFactory.js";
import { TaskContext } from "../../../runners/AgentRunner.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";

export function registerDocsCreateCommand(docs: Command): void {
  docs
    .command("create [doc-name]")
    .description("Generate documentation autonomously for a completed spec")
    .option("--spec <spec>", "Name of the spec to associate with the documentation")
    .action(async (docName?: string, options?: { spec?: string }) => {
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
        const specs = getAvailableSpecs(gw);

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

      const result = prepareDocsPrompt(gw, docName, selectedSpec);

      let promptStr = "";
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
          console.error(`\n✗ Documentation rules not found in .codeforge/rules/docs.md\n`);
          process.exitCode = 1;
          return;
        case "already-exists":
          console.error(`\n✗ Documentation '${docName}' already exists.\n  Use 'codeforge docs update' in the future.\n`);
          process.exitCode = 1;
          return;
        case "prompt":
          promptStr = result.prompt;
          break;
      }

      console.log(`\n▶ Generating documentation '${docName}' for spec: ${selectedSpec}`);

      const docsDir = ".codeforge/docs";
      if (!gw.exists(docsDir)) {
        gw.mkdir(docsDir);
      }
      const promptPath = `${docsDir}/${docName}.prompt.md`;
      gw.writeFile(promptPath, promptStr);

      const runner = RunnerFactory.createRunner(config.environment);
      const context: TaskContext = {
        promptFilePath: promptPath,
        specName: selectedSpec,
        model: config.plannerAgent,
        silent: true,
      };

      const ui = new AgentProgressUI("Generating docs...", config.plannerAgent);
      ui.init();
      ui.start();

      try {
        await runner.execute(context);
        ui.stop(true, "Docs generated");
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
    });
}
