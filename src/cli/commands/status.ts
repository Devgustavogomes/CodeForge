import { Command } from "commander";
import { AppContainer, createAppContainer } from "../../infrastructure/container.js";
import { ActionResult } from "../types.js";
import { translate } from "../ui/i18n.js";
import { formatStatusOutput } from "../ui/statusFormatter.js";
import { promptSelectIntent } from "../common/prompts.js";

export { formatPlainTextStatus } from "../ui/statusFormatter.js";

export async function statusAction(
  intent?: string,
  _options: { once?: boolean } = {},
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  let intentName = intent;

  if (!intentName) {
    const selected = await promptSelectIntent(container, lang, {
      emptyErrorKey: "err_no_intents_run",
      messageKey: "status_select_intent",
    });

    if (selected === undefined) {
      return { success: false };
    }
    if (selected === null) {
      return { back: true };
    }
    intentName = selected;
  }

  const statusUseCase = container.getIntentStatusUseCase;
  const result = statusUseCase.execute(intentName);

  switch (result.kind) {
    case "not-initialized":
      console.error(translate("err_not_initialized", lang));
      process.exitCode = 1;
      return { success: false };
    case "intent-not-found":
      console.error(translate("err_intent_not_found", lang, { intent: intentName }));
      process.exitCode = 1;
      return { success: false };
    case "no-execution": {
      const name = result.intentName;
      console.log(translate("status_no_execution", lang, { intent: name }));
      return { success: true };
    }
    case "status":
      console.log(formatStatusOutput(result, { language: lang }));
      return { success: true };
    default:
      return { success: false };
  }
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status [intent]")
    .description("Show execution progress for an intent")
    .option("--once", "Print status once and exit")
    .action(async (intent: string | undefined, options: { once?: boolean }) => {
      await statusAction(intent, options);
    });
}
