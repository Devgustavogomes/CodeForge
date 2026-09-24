import { Command } from "commander";
import { PATHS } from "../../../infrastructure/paths.js";
import { translate } from "../../ui/i18n.js";
import { CommandHookDispatcher } from "../../../infrastructure/hooks/CommandHookDispatcher.js";
import { NoopHookDispatcher } from "../../../infrastructure/hooks/NoopHookDispatcher.js";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";
import { CliHookReporter } from "../../ui/CliHookReporter.js";
import { TerminalSchedulerReporter } from "../../ui/TerminalSchedulerReporter.js";
import {
  isPromptCancellation,
  handlePromptCancellation,
  promptSelectIntent,
} from "../../common/prompts.js";

export async function taskRetryAction(
  intent?: string,
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
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

  try {
    if (!intentName) {
      const selected = await promptSelectIntent(container, lang, {
        emptyErrorKey: "err_no_intents_run",
        messageKey: "run_select_intent",
      });

      if (selected === undefined) {
        return { success: false };
      }
      if (selected === null) {
        return { back: true };
      }
      intentName = selected;
    }

    const useCase = container.taskOperationsUseCase;
    const result = useCase.retryIntent(intentName);

    switch (result.kind) {
      case "intent-not-found":
        console.error(translate("err_intent_not_found", lang, { intent: intentName }));
        process.exitCode = 1;
        return { success: false };
      case "no-execution":
        console.log(translate("status_no_execution", lang, { intent: intentName }));
        return { success: true };
      case "all-completed":
        console.log(translate("retry_all_completed", lang, { intent: intentName }));
        return { success: true };
      case "no-failed-tasks":
        console.log(translate("retry_no_failed_tasks", lang, { intent: intentName }));
        return { success: true };
      case "retried": {
        const status = container.getIntentStatusUseCase.execute(intentName);
        const pendingCount = status.kind === "status"
          ? Math.max(0, status.tasks.filter((task) => task.status === "pending").length - result.retriedTasks.length)
          : 0;
        console.log(
          translate("retry_success_starting", lang, {
            count: result.retriedTasks.length,
            pending: pendingCount,
            intent: intentName,
          }),
        );
        const runner = container.runnerProvider(config.environment);
        const reporter = new TerminalSchedulerReporter({
          getStatus: (name) => container.getIntentStatusUseCase.execute(name),
          language: lang,
        });
        const hooks = config.hooks
          ? new CommandHookDispatcher(
              config.hooks,
              process.cwd(),
              container.processExecutor,
              new CliHookReporter({ terminalReporter: reporter, language: lang }),
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
          if (runResult.status === "failed" || runResult.status === "deadlock") {
            process.exitCode = 1;
            return { success: false };
          }
          return { success: true };
        } finally {
          reporter.cleanup();
        }
      }
      default:
        return { success: false };
    }
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      return handlePromptCancellation(lang);
    }
    throw error;
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
