import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { createAppContainer } from "../../../infrastructure/container.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";
import { translate } from "../../ui/i18n.js";
import { ActionResult } from "../../types.js";

export async function planGenerateAction(intent?: string): Promise<ActionResult> {
  const container = createAppContainer();

  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  if (!config) {
    console.error(translate("err_not_configured", lang));
    process.exitCode = 1;
    return { success: false };
  }

  let selectedIntent = intent;

  if (!selectedIntent) {
    const listUseCase = container.listIntentsUseCase ?? container.listIntentsUseCase;
    const intents = listUseCase.execute();

    if (intents.length === 0) {
      console.error(translate("err_no_intents", lang));
      process.exitCode = 1;
      return { success: false };
    }

    selectedIntent = await select({
      message: translate("plan_select_intent", lang),
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...intents.map((s) => ({ name: s.name, value: s.name })),
      ],
    });

    if (selectedIntent === "back") {
      return { back: true };
    }
  }

  console.log(translate("plan_generating", lang, { intent: selectedIntent,}));

  const useCase = container.generatePlanUseCase;

  const ui = new AgentProgressUI(translate("plan_ui_generating", lang), config.plannerAgent);
  ui.init();
  ui.start();

  try {
    const valResult = await useCase.execute(
      selectedIntent,
      config.plannerAgent,
    );

    switch (valResult.kind) {
      case "not-initialized":
        ui.stop(false, translate("plan_ui_failed", lang));
        console.error(translate("err_not_initialized", lang));
        process.exitCode = 1;
        return { success: false };
      case "intent-not-found":
        ui.stop(false, translate("plan_ui_failed", lang));
        console.error(translate("err_intent_not_found", lang, { intent: selectedIntent,}));
        process.exitCode = 1;
        return { success: false };
      case "tasks-dir-not-found":
        ui.stop(false, translate("plan_ui_failed", lang));
        console.error(translate("plan_err_tasks_dir_not_found", lang, { intent: selectedIntent,}));
        process.exitCode = 1;
        return { success: false };
      case "invalid":
        ui.stop(false, translate("plan_ui_failed", lang));
        console.error(translate("plan_err_validation_failed", lang, { intent: selectedIntent,}));
        for (const err of valResult.errors) {
          console.error(`  - ${err}`);
        }
        console.error(translate("plan_err_fix_instructions", lang));
        process.exitCode = 1;
        return { success: false };
      case "valid":
        ui.stop(true, translate("plan_ui_success", lang));
        console.log(translate("plan_success", lang, { intent: selectedIntent,}));
        console.log(translate("plan_next_step", lang, { intent: selectedIntent,}));
        return { success: true };
    }
  } catch (error) {
    ui.stop(false, "Failed");
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
    return { success: false };
  }
}

export function registerPlanGenerateCommand(plan: Command): void {
  plan
    .command("generate [intent]")
    .description("Generate and execute a planning prompt autonomously")
    .action(async (intent?: string) => {
      await planGenerateAction(intent);
    });
}
