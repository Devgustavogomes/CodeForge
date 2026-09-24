import { Command } from "commander";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";
import { translate } from "../../ui/i18n.js";
import {
  isPromptCancellation,
  handlePromptCancellation,
  promptSelectIntent,
  promptConfirmAction,
} from "../../common/prompts.js";

export interface IntentDeleteOptions {
  force?: boolean;
}

export async function intentDeleteAction(
  name?: string,
  options: IntentDeleteOptions = {},
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  let intentName = name;
  let lang: "en" | "pt" | "es" = "en";

  try {
    const config = container.configService.loadConfig();
    lang = config?.language || "en";

    if (!intentName) {
      const selected = await promptSelectIntent(container, lang, {
        emptyErrorKey: "intent_delete_no_intents",
        messageKey: "intent_delete_select",
      });

      if (selected === undefined) {
        return { success: false };
      }
      if (selected === null) {
        return { back: true };
      }
      intentName = selected;
    }

    if (!options.force) {
      const confirmed = await promptConfirmAction(
        translate("intent_delete_confirm", lang, { intent: intentName }),
        lang,
      );

      if (!confirmed) {
        return { back: true };
      }
    }

    const deleteUseCase = container.deleteIntentUseCase;
    const result = deleteUseCase.execute(intentName);

    if (result.kind === "not-initialized") {
      console.error(translate("err_not_initialized", lang));
      process.exitCode = 1;
      return { success: false };
    }

    if (result.kind === "intent-not-found") {
      console.error(
        translate("intent_delete_not_found", lang, { intent: intentName }),
      );
      process.exitCode = 1;
      return { success: false };
    }

    if (result.kind === "deleted") {
      console.log(
        translate("intent_delete_success", lang, { intent: result.intentName }),
      );
      return { success: true };
    }

    return { success: false };
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      return handlePromptCancellation(lang);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(
      translate("intent_delete_error", lang, {
        intent: intentName || name || "",
        error: message,
      }),
    );
    process.exitCode = 1;
    return { success: false };
  }
}

export function registerIntentDeleteCommand(intent: Command): void {
  intent
    .command("delete [name]")
    .alias("rm")
    .description("Delete an intent and all of its related artifacts")
    .option("-f, --force", "Skip the deletion confirmation")
    .action(async (name?: string, options?: IntentDeleteOptions) => {
      await intentDeleteAction(name, options);
    });
}
