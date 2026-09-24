import { Command } from "commander";
import { input } from "@inquirer/prompts";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";
import { translate } from "../../ui/i18n.js";
import { ActionResult } from "../../types.js";
import {
  isPromptCancellation,
  handlePromptCancellation,
  promptSelectIntent,
} from "../../common/prompts.js";

export async function docsCreateAction(
  docName?: string,
  options?: { intent?: string },
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  if (!config) {
    console.error(translate("err_not_configured", lang));
    process.exitCode = 1;
    return { success: false };
  }

  let finalDocName = docName;

  try {
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

    let selectedIntent = options?.intent;

    if (!selectedIntent) {
      const selected = await promptSelectIntent(container, lang, {
        messageKey: "docs_create_select_intent",
      });

      if (selected === undefined) {
        return { success: false };
      }
      if (selected === null) {
        return { back: true };
      }
      selectedIntent = selected;
    }

    console.log(
      translate("docs_create_generating", lang, {
        docName: finalDocName,
        intent: selectedIntent,
      })
    );

    const ui = new AgentProgressUI(
      translate("docs_create_ui_generating", lang),
      config.plannerAgent
    );
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
          console.error(
            translate("err_intent_not_found", lang, { intent: selectedIntent })
          );
          process.exitCode = 1;
          return { success: false };
        case "already-exists":
          console.error(
            translate("docs_create_err_already_exists", lang, {
              docName: finalDocName,
            })
          );
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
  } catch (error) {
    if (isPromptCancellation(error)) {
      return handlePromptCancellation(lang);
    }
    throw error;
  }
}

export function registerDocsCreateCommand(docs: Command): void {
  docs
    .command("create [doc-name]")
    .description("Generate documentation autonomously for a completed intent")
    .option("--intent <intent>", "Name of the intent to associate with the documentation")
    .action(async (docName?: string, options?: { intent?: string }) => {
      await docsCreateAction(docName, options);
    });
}
