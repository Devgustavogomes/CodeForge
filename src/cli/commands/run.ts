import { select } from "@inquirer/prompts";
import { Command } from "commander";
import { HookDispatcher } from "../../application/ports/HookDispatcher.js";
import { AppContainer, createAppContainer } from "../../infrastructure/container.js";
import { CommandHookDispatcher } from "../../infrastructure/hooks/CommandHookDispatcher.js";
import { NoopHookDispatcher } from "../../infrastructure/hooks/NoopHookDispatcher.js";
import { ActionResult } from "../types.js";
import { CliHookReporter } from "../ui/CliHookReporter.js";
import { translate } from "../ui/i18n.js";
import { TerminalSchedulerReporter } from "../ui/TerminalSchedulerReporter.js";

export async function runAction(
  intent?: string,
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  const config = container.configService.loadConfig() ?? {
    environment: "antigravity",
    plannerAgent: "default",
    executorAgent: "default",
    language: "en",
  };
  const lang = config.language || "en";

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
      message: translate("run_select_intent", lang),
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...intents.map((item) => ({ name: item.name, value: item.name })),
      ],
    });

    if (intentName === "back") {
      return { back: true };
    }
  }

  const runner = container.runnerProvider(config.environment);
  const reporter = new TerminalSchedulerReporter({
    getStatus: (name: string) => {
      const uc = container.getIntentStatusUseCase ?? container.getIntentStatusUseCase;
      return uc.execute(name);
    },
    language: lang,
  });

  const hooks: HookDispatcher = config.hooks
    ? new CommandHookDispatcher(
        config.hooks,
        process.cwd(),
        container.processExecutor,
        new CliHookReporter({
          terminalReporter: reporter,
          language: lang,
        }),
      )
    : new NoopHookDispatcher();

  const scheduler = container.createTaskScheduler(
    runner,
    config,
    reporter,
    hooks,
  );

  try {
    const runResult = await scheduler.run(intentName, config.executorAgent);

    if (runResult.status === "completed") {
      process.exitCode = 0;
      return { success: true };
    }

    process.exitCode = 1;
    return { success: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(translate("terminal_run_error", lang, { error: message }));
    process.exitCode = 1;
    return { success: false };
  }
}

export function registerRunCommand(program: Command): void {
  program
    .command("run [intent]")
    .description("Execute tasks for a given intent autonomously")
    .action(async (intent?: string) => {
      await runAction(intent);
    });
}
