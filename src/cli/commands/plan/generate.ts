import fs from "node:fs";
import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import {
  getAvailableSpecs,
  preparePlanningPrompt,
} from "../../../application/plan.js";
import { ConfigService } from "../../../config/ConfigService.js";
import { RunnerFactory } from "../../../runners/RunnerFactory.js";
import { validatePlan } from "../../../application/validate.js";
import { TaskContext } from "../../../runners/AgentRunner.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";

export function registerPlanGenerateCommand(plan: Command): void {
  plan
    .command("generate [spec]")
    .description("Generate and execute a planning prompt autonomously")
    .action(async (spec?: string) => {
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
          message: "Select a spec to generate a plan for:",
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      const result = preparePlanningPrompt(gw, selectedSpec);

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
        case "ready":
          promptStr = result.prompt;
          break;
      }

      console.log(`\n▶ Generating plan for spec: ${selectedSpec}`);

      const plansDir = ".codeforge/plans";
      if (!gw.exists(plansDir)) {
        gw.mkdir(plansDir);
      }
      const promptPath = `${plansDir}/${selectedSpec}.temp.prompt.md`;
      gw.writeFile(promptPath, promptStr);

      const runner = RunnerFactory.createRunner(config.environment);
      const context: TaskContext = {
        promptFilePath: promptPath,
        specName: selectedSpec,
        model: config.plannerAgent,
        silent: true,
      };

      const ui = new AgentProgressUI("Generating plan...", config.plannerAgent);
      ui.init();
      ui.start();

      try {
        await runner.execute(context);
        ui.stop(true, "Plan generated");

        console.log(`\n▶ Validating generated plan...`);
        const valResult = validatePlan(gw, selectedSpec);

        switch (valResult.kind) {
          case "not-initialized":
            console.error("\n✗ CodeForge is not initialized.\n");
            process.exitCode = 1;
            break;
          case "spec-not-found":
            console.error(
              `\n✗ No tasks directory found for spec: ${selectedSpec}. The planner agent failed to create it.\n`,
            );
            process.exitCode = 1;
            break;
          case "invalid":
            console.error(
              `\n✗ Validation failed for plan '${selectedSpec}':\n`,
            );
            for (const err of valResult.errors) {
              console.error(`  - ${err}`);
            }
            console.error(
              "\n[AI INSTRUCTION] Fix these errors in the JSON files and run validation again.\n",
            );
            process.exitCode = 1;
            break;
          case "valid":
            console.log(
              `\n✓ Plan for '${selectedSpec}' is valid and ready for execution!`,
            );
            console.log(`Next step: run \`codeforge run ${selectedSpec}\`\n`);
            break;
        }
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
