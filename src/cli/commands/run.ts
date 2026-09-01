import { NodeWorkspaceGateway } from "../../infrastructure/workspace.js";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../application/plan.js";
import { ConfigService } from "../../config/ConfigService.js";
import { RunnerFactory } from "../../runners/RunnerFactory.js";
import { TaskScheduler } from "../../scheduler/TaskScheduler.js";
import { PATHS } from "../../infrastructure/paths.js";
import { TerminalSchedulerReporter } from "../ui/TerminalSchedulerReporter.js";
import { translate } from "../ui/i18n.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run [spec]")
    .description("Execute tasks for a given spec autonomously")
    .action(async (spec?: string) => {
      const gw = new NodeWorkspaceGateway(process.cwd());

      const configService = new ConfigService(gw);
      const config = configService.loadConfig();
      const lang = config?.language || "en";

      if (!gw.exists(PATHS.metadata)) {
        console.error(translate("err_not_initialized", lang));
        process.exitCode = 1;
        return;
      }

      if (!config) {
        console.error(translate("err_not_configured", lang));
        process.exitCode = 1;
        return;
      }

      let specName = spec;

      if (!specName) {
        const specs = getAvailableSpecs(gw);

        if (specs.length === 0) {
          console.error(translate("err_no_specs_run", lang));
          process.exitCode = 1;
          return;
        }

        specName = await select({
          message: translate("run_select_spec", lang),
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      const runner = RunnerFactory.createRunner(config.environment);
      const reporter = new TerminalSchedulerReporter(gw);
      const scheduler = new TaskScheduler(gw, runner, config, reporter);

      await scheduler.run(specName, config.executorAgent);
    });
}
