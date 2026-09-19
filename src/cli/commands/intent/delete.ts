import { confirm, select } from "@inquirer/prompts";
import { Command } from "commander";
import { createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";
import { translate } from "../../ui/i18n.js";

export interface IntentDeleteOptions {
  force?: boolean;
}
function isPromptCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "ExitPromptError";
}

export async function intentDeleteAction(
  name?: string,
  options: IntentDeleteOptions = {},
): Promise<ActionResult> {
  let intentName = name;
  let lang: "en" | "pt" | "es" = "en";

  try {
    const container = createAppContainer();
    const config = container.configService.loadConfig();
    lang = config?.language || "en";

    if (!intentName) {
      const listUseCase = container.listIntentsUseCase ?? container.listIntentsUseCase;
      const intents = listUseCase.execute();
      if (intents.length === 0) {
        console.error(translate("intent_delete_no_intents", lang));
        process.exitCode = 1;
        return { success: false };
      }

      intentName = await select({
        message: translate("intent_delete_select", lang),
        choices: [
          { name: translate("menu_back", lang), value: "back" },
          ...intents.map((item) => ({ name: item.name, value: item.name })),
        ],
      });

      if (intentName === "back") {
        return { back: true };
      }
    }

    if (!options.force) {
      const confirmed = await confirm({
        message: translate("intent_delete_confirm", lang, {
          intent: intentName,        }),
        default: false,
      });

      if (!confirmed) {
        console.log(translate("delete_cancelled", lang));
        return { back: true };
      }
    }

    const deleteUseCase = container.deleteIntentUseCase;
    const result = deleteUseCase.execute(intentName);
    const resultKind = result.kind;

    if (resultKind === "not-initialized") {
      console.error(translate("err_not_initialized", lang));
      process.exitCode = 1;
      return { success: false };
    }

    if (resultKind === "intent-not-found") {
      console.error(
        translate("intent_delete_not_found", lang, {
          intent: intentName,        }),
      );
      process.exitCode = 1;
      return { success: false };
    }

    if (resultKind === "deleted") {
      const deletedName =
        result.intentName;
      console.log(
        translate("intent_delete_success", lang, {
          intent: deletedName,        }),
      );
      return { success: true };
    }

    return { success: false };
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      console.log(translate("delete_cancelled", lang));
      return { back: true };
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(
      translate("intent_delete_error", lang, {
        intent: intentName || name || "",        error: message,
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
