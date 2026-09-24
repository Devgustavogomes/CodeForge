import { Command } from "commander";
import { HookDispatcher } from "../../application/ports/HookDispatcher.js";
import { AppContainer, createAppContainer } from "../../infrastructure/container.js";
import { CommandHookDispatcher } from "../../infrastructure/hooks/CommandHookDispatcher.js";
import { NoopHookDispatcher } from "../../infrastructure/hooks/NoopHookDispatcher.js";
import { ActionResult } from "../types.js";
import { CliHookReporter } from "../ui/CliHookReporter.js";
import { translate } from "../ui/i18n.js";
import { TerminalSchedulerReporter } from "../ui/TerminalSchedulerReporter.js";
import { promptSelectIntent } from "../common/prompts.js";

export interface RunCommandOptions {
  review?: boolean;
  skipReview?: boolean;
}

export async function runAction(
  intent?: string,
  container: AppContainer = createAppContainer(),
  options: RunCommandOptions = {},
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

  const runner = container.runnerProvider(config.environment);
  const reporter = new TerminalSchedulerReporter({
    getStatus: (name: string) => {
      const uc = container.getIntentStatusUseCase;
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
    const reviewOptions = {
      forceReview: options.review === true,
      skipReview: options.skipReview === true,
    };
    const hasReviewOverride = reviewOptions.forceReview || reviewOptions.skipReview;
    const runResult = hasReviewOverride
      ? await scheduler.run(intentName, config.executorAgent, reviewOptions)
      : await scheduler.run(intentName, config.executorAgent);

    if (runResult.status === "completed" || runResult.status === "pending") {
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
    .option("--review", "Force AI review for this run")
    .option("--skip-review", "Skip AI review for this run")
    .action(async (intent: string | undefined, options: RunCommandOptions) => {
      await runAction(intent, undefined, options);
    });
}
