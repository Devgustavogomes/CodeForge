import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { PATHS } from "../../../infrastructure/paths.js";
import { translate } from "../../ui/i18n.js";
import { CommandHookDispatcher } from "../../../infrastructure/hooks/CommandHookDispatcher.js";
import { NoopHookDispatcher } from "../../../infrastructure/hooks/NoopHookDispatcher.js";
import { createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";

export async function taskRetryAction(intent?: string): Promise<ActionResult> {
  const container = createAppContainer();

  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  if (!container.gw.exists(PATHS.metadata)) {
    console.error(translate("err_not_initialized", lang));
    process.exitCode = 1;
    return { success: false };
  }

  if (!config) {
    console.error(translate("err_not_configured", lang));
    process.exitCode = 1;
    return { success: false };
  }

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
        ...intents.map((s) => ({ name: s.name, value: s.name })),
      ],
    });

    if (intentName === "back") {
      return { back: true };
    }
  }

  const useCase = container.taskOperationsUseCase;
  const result = useCase.retryIntent(intentName);

  switch (result.kind) {
    case "intent-not-found":
      console.error(translate("err_intent_not_found", lang, { intent: intentName,}));
      process.exitCode = 1;
      return { success: false };
    case "no-execution":
      console.log(translate("status_no_execution", lang, { intent: intentName,}));
      return { success: true };
    case "all-completed":
      console.log(translate("retry_all_completed", lang, { intent: intentName,}));
      return { success: true };
    case "no-failed-tasks":
      console.log(translate("retry_no_failed_tasks", lang, { intent: intentName,}));
      return { success: true };
    case "retried": {
      console.log(
        translate("retry_success_starting", lang, {
          count: result.retriedTasks.length,
          intent: intentName,        }),
      );
      const runner = container.runnerProvider(config.environment);
      const hooks = config.hooks
        ? new CommandHookDispatcher(config.hooks, process.cwd(), container.processExecutor)
        : new NoopHookDispatcher();
      const scheduler = container.createTaskScheduler(
        runner,
        config,
        undefined,
        hooks,
      );
      const runResult = await scheduler.run(intentName, config.executorAgent);
      if (runResult.status === "failed" || runResult.status === "deadlock") {
        process.exitCode = 1;
        return { success: false };
      }
      return { success: true };
    }
    default:
      return { success: false };
  }
}

export function registerTaskRetryCommand(task: Command): void {
  task
    .command("retry [intent]")
    .description("Retry failed tasks for an intent and resume execution")
    .action(async (intent?: string) => {
      await taskRetryAction(intent);
    });
}
