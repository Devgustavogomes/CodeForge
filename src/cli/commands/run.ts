import { select } from "@inquirer/prompts";
import { Command } from "commander";
import { AppContainer, createAppContainer } from "../../infrastructure/container.js";
import { CommandHookDispatcher } from "../../infrastructure/hooks/CommandHookDispatcher.js";
import { NoopHookDispatcher } from "../../infrastructure/hooks/NoopHookDispatcher.js";
import { ActionResult } from "../types.js";
import { translate } from "../ui/i18n.js";
import { TerminalSchedulerReporter } from "../ui/TerminalSchedulerReporter.js";

export async function runAction(
  spec?: string,
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  const config = container.configService.loadConfig() ?? {
    environment: "antigravity",
    plannerAgent: "default",
    executorAgent: "default",
    language: "en",
  };
  const lang = config.language || "en";

  let specName = spec;

  if (!specName) {
    const specs = container.listSpecsUseCase.execute();

    if (specs.length === 0) {
      console.error(translate("err_no_specs_run", lang));
      process.exitCode = 1;
      return { success: false };
    }

    specName = await select({
      message: translate("run_select_spec", lang),
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...specs.map((item) => ({ name: item.name, value: item.name })),
      ],
    });

    if (specName === "back") {
      return { back: true };
    }
  }

  const runner = container.runnerProvider(config.environment);
  const hooks = config.hooks
    ? new CommandHookDispatcher(
        config.hooks,
        process.cwd(),
        container.processExecutor,
      )
    : new NoopHookDispatcher();

  const reporter = new TerminalSchedulerReporter({
    getStatus: (name: string) => container.getSpecStatusUseCase.execute(name),
    language: lang,
  });

  const scheduler = container.createTaskScheduler(
    runner,
    config,
    reporter,
    hooks,
  );

  try {
    const runResult = await scheduler.run(specName, config.executorAgent);

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
    .command("run [spec]")
    .description("Execute tasks for a given spec autonomously")
    .action(async (spec?: string) => {
      await runAction(spec);
    });
}
