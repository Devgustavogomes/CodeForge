import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { PATHS } from "../../../infrastructure/paths.js";
import { TerminalSchedulerReporter } from "../../ui/TerminalSchedulerReporter.js";
import { translate } from "../../ui/i18n.js";
import { CommandHookDispatcher } from "../../../infrastructure/hooks/CommandHookDispatcher.js";
import { NoopHookDispatcher } from "../../../infrastructure/hooks/NoopHookDispatcher.js";
import { createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../menu/types.js";

export async function taskRetryAction(spec?: string): Promise<ActionResult> {
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
        ...specs.map((s) => ({ name: s.name, value: s.name })),
      ],
    });

    if (specName === "back") {
      return { back: true };
    }
  }

  const useCase = container.taskOperationsUseCase;
  const result = useCase.retrySpec(specName);

  switch (result.kind) {
    case "spec-not-found":
      console.error(translate("err_spec_not_found", lang, { spec: specName }));
      process.exitCode = 1;
      return { success: false };
    case "no-execution":
      console.log(translate("status_no_execution", lang, { spec: specName }));
      return { success: true };
    case "all-completed":
      console.log(translate("retry_all_completed", lang, { spec: specName }));
      return { success: true };
    case "no-failed-tasks":
      console.log(translate("retry_no_failed_tasks", lang, { spec: specName }));
      return { success: true };
    case "retried": {
      console.log(
        translate("retry_success_starting", lang, {
          count: result.retriedTasks.length,
          spec: specName,
        }),
      );
      const runner = container.runnerProvider(config.environment);
      const reporter = new TerminalSchedulerReporter(container.gw);
      const hooks = config.hooks
        ? new CommandHookDispatcher(config.hooks, process.cwd(), container.processExecutor)
        : new NoopHookDispatcher();
      const scheduler = container.createTaskScheduler(
        runner,
        config,
        reporter,
        hooks,
      );
      const runResult = await scheduler.run(specName, config.executorAgent);
      if (runResult.status === "failed" || runResult.status === "deadlock") {
        process.exitCode = 1;
        return { success: false };
      }
      return { success: true };
    }
  }
}

export function registerTaskRetryCommand(task: Command): void {
  task
    .command("retry [spec]")
    .description("Retry failed tasks for a spec and resume execution")
    .action(async (spec?: string) => {
      await taskRetryAction(spec);
    });
}
