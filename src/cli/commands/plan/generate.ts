import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../../application/plan.js";
import { ConfigService } from "../../../config/ConfigService.js";
import { RunnerFactory } from "../../../runners/RunnerFactory.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";
import { GeneratePlanUseCase } from "../../../application/use-cases/GeneratePlanUseCase.js";
import { translate } from "../../ui/i18n.js";

export function registerPlanGenerateCommand(plan: Command): void {
  plan
    .command("generate [spec]")
    .description("Generate and execute a planning prompt autonomously")
    .action(async (spec?: string) => {
      const gw = new NodeWorkspaceGateway(process.cwd());

      const configService = new ConfigService(gw);
      const config = configService.loadConfig();
      const lang = config?.language || "en";

      if (!config) {
        console.error(translate("err_not_configured", lang));
        process.exitCode = 1;
        return;
      }

      let selectedSpec = spec;

      if (!selectedSpec) {
        const specs = getAvailableSpecs(gw);

        if (specs.length === 0) {
          console.error(translate("err_no_specs", lang));
          process.exitCode = 1;
          return;
        }

        selectedSpec = await select({
          message: translate("plan_select_spec", lang),
          choices: [
            { name: translate("menu_back", lang), value: "back" },
            ...specs.map((s) => ({ name: s, value: s }))
          ],
        });

        if (selectedSpec === "back") {
          if (process.env.CODEFORGE_INTERACTIVE) {
            process.exit(200);
          } else {
            process.exit(0);
          }
        }
      }

      console.log(translate("plan_generating", lang, { spec: selectedSpec }));

      const runner = RunnerFactory.createRunner(config.environment);
      const useCase = new GeneratePlanUseCase(gw, runner, config);

      const ui = new AgentProgressUI(translate("plan_ui_generating", lang), config.plannerAgent);
      ui.init();
      ui.start();

      try {
        const valResult = await useCase.execute(
          selectedSpec,
          config.plannerAgent,
        );

        switch (valResult.kind) {
          case "not-initialized":
            ui.stop(false, translate("plan_ui_failed", lang));
            console.error(translate("err_not_initialized", lang));
            process.exitCode = 1;
            break;
          case "spec-not-found":
            ui.stop(false, translate("plan_ui_failed", lang));
            console.error(translate("err_spec_not_found", lang, { spec: selectedSpec }));
            process.exitCode = 1;
            break;
          case "tasks-dir-not-found":
            ui.stop(false, translate("plan_ui_failed", lang));
            console.error(translate("plan_err_tasks_dir_not_found", lang, { spec: selectedSpec }));
            process.exitCode = 1;
            break;
          case "invalid":
            ui.stop(false, translate("plan_ui_failed", lang));
            console.error(translate("plan_err_validation_failed", lang, { spec: selectedSpec }));
            for (const err of valResult.errors) {
              console.error(`  - ${err}`);
            }
            console.error(translate("plan_err_fix_instructions", lang));
            process.exitCode = 1;
            break;
          case "valid":
            ui.stop(true, translate("plan_ui_success", lang));
            console.log(translate("plan_success", lang, { spec: selectedSpec }));
            console.log(translate("plan_next_step", lang, { spec: selectedSpec }));
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
