import { Command } from "commander";
import { select, input } from "@inquirer/prompts";
import { createAppContainer } from "../../../infrastructure/container.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";
import { translate } from "../../ui/i18n.js";
import { ActionResult } from "../../types.js";

export async function docsCreateAction(
  docName?: string,
  options?: { intent?: string;}
): Promise<ActionResult> {
  const container = createAppContainer();

  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  if (!config) {
    console.error(translate("err_not_configured", lang));
    process.exitCode = 1;
    return { success: false };
  }

  let finalDocName = docName;

  if (!finalDocName) {
    finalDocName = await input({
      message: translate("docs_create_enter_name", lang),
    });

    if (finalDocName.trim().length === 0) {
      console.error(translate("docs_create_err_empty_name", lang));
      process.exitCode = 1;
      return { success: false };
    }

    finalDocName = finalDocName.trim();
  }

  let selectedIntent = options?.intent || options?.intent;

  if (!selectedIntent) {
    const listUseCase = container.listIntentsUseCase ?? container.listIntentsUseCase;
    const intents = listUseCase.execute();

    if (intents.length === 0) {
      console.error(translate("err_no_intents", lang));
      process.exitCode = 1;
      return { success: false };
    }

    selectedIntent = await select({
      message: translate("docs_create_select_intent", lang),
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...intents.map((s) => ({ name: s.name, value: s.name })),
      ],
    });

    if (selectedIntent === "back") {
      return { back: true };
    }
  }

  console.log(translate("docs_create_generating", lang, { docName: finalDocName, intent: selectedIntent,}));

  const ui = new AgentProgressUI(translate("docs_create_ui_generating", lang), config.plannerAgent);
  ui.init();
  ui.start();

  try {
    const createDocUseCase = container.createDocUseCase;
    const result = await createDocUseCase.execute(finalDocName, selectedIntent);

    ui.stop(true, translate("docs_create_ui_success", lang));

    switch (result.kind) {
      case "not-initialized":
        console.error(translate("err_not_initialized", lang));
        process.exitCode = 1;
        return { success: false };
      case "intent-not-found":
        console.error(translate("err_intent_not_found", lang, { intent: selectedIntent,}));
        process.exitCode = 1;
        return { success: false };
      case "rules-not-found":
        console.error(translate("docs_create_err_rules_not_found", lang));
        process.exitCode = 1;
        return { success: false };
      case "already-exists":
        console.error(translate("docs_create_err_already_exists", lang, { docName: finalDocName }));
        process.exitCode = 1;
        return { success: false };
    }

    return { success: true };

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

export function registerDocsCreateCommand(docs: Command): void {
  docs
    .command("create [doc-name]")
    .description("Generate documentation autonomously for a completed intent")
    .option("--intent <intent>", "Name of the intent to associate with the documentation")
    .action(async (docName?: string, options?: { intent?: string;}) => {
      await docsCreateAction(docName, options);
    });
}
