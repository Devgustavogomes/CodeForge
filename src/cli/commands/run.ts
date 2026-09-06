import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { PATHS } from "../../infrastructure/paths.js";
import { TerminalSchedulerReporter } from "../ui/TerminalSchedulerReporter.js";
import { translate } from "../ui/i18n.js";
import { CommandHookDispatcher } from "../../infrastructure/hooks/CommandHookDispatcher.js";
import { NoopHookDispatcher } from "../../infrastructure/hooks/NoopHookDispatcher.js";
import { createAppContainer } from "../../infrastructure/container.js";

import { ActionResult } from "../menu/types.js";

export async function runAction(spec?: string): Promise<ActionResult> {
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
        ...specs.map((s) => ({ name: s.name, value: s.name }))
      ],
    });

    if (specName === "back") {
      return { back: true };
    }
  }

  const runner = container.runnerProvider(config.environment);
  const reporter = new TerminalSchedulerReporter(container.gw);
  const hooks = config.hooks
    ? new CommandHookDispatcher(config.hooks, process.cwd(), container.processExecutor)
    : new NoopHookDispatcher();
  const scheduler = container.createTaskScheduler(runner, config, reporter, hooks);

  const result = await scheduler.run(specName, config.executorAgent);
  if (result.status === "failed" || result.status === "deadlock") {
    process.exitCode = 1;
    return { success: false };
  }

  return { success: true };
}

export function registerRunCommand(program: Command): void {
  program
    .command("run [spec]")
    .description("Execute tasks for a given spec autonomously")
    .action(async (spec?: string) => {
      await runAction(spec);
    });
}
