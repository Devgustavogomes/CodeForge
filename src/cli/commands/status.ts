import { select } from "@inquirer/prompts";
import { Command } from "commander";
import { createAppContainer } from "../../infrastructure/container.js";
import { ActionResult } from "../types.js";
import { translate } from "../ui/i18n.js";
import { formatStatusOutput } from "../ui/statusFormatter.js";

export { formatPlainTextStatus } from "../ui/statusFormatter.js";

export async function statusAction(
  intent?: string,
  _options: { once?: boolean } = {},
): Promise<ActionResult> {
  const container = createAppContainer();
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  let intentName = intent;

  if (!intentName) {
    const listUseCase = container.listIntentsUseCase ?? container.listIntentsUseCase;
    const intents = listUseCase.execute();

    if (intents.length === 0) {
      console.error(translate("err_no_intents_run", lang));
      process.exitCode = 1;
      return { success: false };
    }

    intentName = await select({
      message: translate("status_select_intent", lang),
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...intents.map((item) => ({ name: item.name, value: item.name })),
      ],
    });

    if (intentName === "back") {
      return { back: true };
    }
  }

  const statusUseCase = container.getIntentStatusUseCase ?? container.getIntentStatusUseCase;
  const result = statusUseCase.execute(intentName);

  switch (result.kind) {
    case "not-initialized":
      console.error(translate("err_not_initialized", lang));
      process.exitCode = 1;
      return { success: false };
    case "intent-not-found":
      console.error(translate("err_intent_not_found", lang, { intent: intentName,}));
      process.exitCode = 1;
      return { success: false };
    case "no-execution": {
      const name = result.intentName;
      console.log(translate("status_no_execution", lang, { intent: name,}));
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
