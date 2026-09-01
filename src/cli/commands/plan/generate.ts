import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../../application/plan.js";
import { ConfigService } from "../../../config/ConfigService.js";
import { RunnerFactory } from "../../../runners/RunnerFactory.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";
import { GeneratePlanUseCase } from "../../../application/use-cases/GeneratePlanUseCase.js";

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

      console.log(`\n▶ Generating plan for spec: ${selectedSpec}`);

      const runner = RunnerFactory.createRunner(config.environment);
      const useCase = new GeneratePlanUseCase(gw, runner);

      const ui = new AgentProgressUI("Generating plan...", config.plannerAgent);
      ui.init();
      ui.start();

      try {
        const valResult = await useCase.execute(
          selectedSpec,
          config.plannerAgent,
        );

        switch (valResult.kind) {
          case "not-initialized":
            ui.stop(false, "Failed");
            console.error(
              "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n",
            );
            process.exitCode = 1;
            break;
          case "spec-not-found":
            ui.stop(false, "Failed");
            console.error(`\n✗ Spec not found: ${selectedSpec}.md\n`);
            process.exitCode = 1;
            break;
          case "tasks-dir-not-found":
            ui.stop(false, "Failed");
            console.error(
              `\n✗ No tasks directory found for spec: ${selectedSpec}. The planner agent failed to create it.\n`,
            );
            process.exitCode = 1;
            break;
          case "invalid":
            ui.stop(false, "Failed");
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
            ui.stop(true, "Plan generated");
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
      }
    });
}
