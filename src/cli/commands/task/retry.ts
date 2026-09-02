import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { TaskOperationsUseCase } from "../../../application/use-cases/TaskOperationsUseCase.js";
import { ListSpecsUseCase } from "../../../application/use-cases/ListSpecsUseCase.js";
import { ConfigService } from "../../../config/ConfigService.js";
import { RunnerFactory } from "../../../runners/RunnerFactory.js";
import { TaskScheduler } from "../../../scheduler/TaskScheduler.js";
import { PATHS } from "../../../infrastructure/paths.js";
import { TerminalSchedulerReporter } from "../../ui/TerminalSchedulerReporter.js";
import { translate } from "../../ui/i18n.js";
import { ExecutionStateRepository } from "../../../infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../../application/services/PromptService.js";

export function registerTaskRetryCommand(task: Command): void {
  task
    .command("retry [spec]")
    .description("Retry failed tasks for a spec and resume execution")
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
        const listSpecsUseCase = new ListSpecsUseCase(gw);
        const specs = listSpecsUseCase.execute();

        if (specs.length === 0) {
          console.error(translate("err_no_specs_run", lang));
          process.exitCode = 1;
          return;
        }

        specName = await select({
          message: translate("run_select_spec", lang),
          choices: [
            { name: translate("menu_back", lang), value: "back" },
            ...specs.map((s) => ({ name: s, value: s })),
          ],
        });

        if (specName === "back") {
          if (process.env.CODEFORGE_INTERACTIVE) {
            process.exit(200);
          } else {
            process.exit(0);
          }
        }
      }

      const useCase = new TaskOperationsUseCase(gw);
      const result = useCase.retrySpec(specName);

      switch (result.kind) {
        case "spec-not-found":
          console.error(translate("err_spec_not_found", lang, { spec: specName }));
          process.exitCode = 1;
          break;
        case "no-execution":
          console.log(translate("status_no_execution", lang, { spec: specName }));
          break;
        case "all-completed":
          console.log(translate("retry_all_completed", lang, { spec: specName }));
          break;
        case "no-failed-tasks":
          console.log(translate("retry_no_failed_tasks", lang, { spec: specName }));
          break;
        case "retried": {
          console.log(
            translate("retry_success_starting", lang, {
              count: result.retriedTasks.length,
              spec: specName,
            }),
          );
          const runner = RunnerFactory.createRunner(config.environment);
          const reporter = new TerminalSchedulerReporter(gw);
          const stateRepo = new ExecutionStateRepository(gw);
          const promptService = new PromptService(gw);
          const scheduler = new TaskScheduler(
            gw,
            runner,
            config,
            stateRepo,
            promptService,
            reporter,
          );
          await scheduler.run(specName, config.executorAgent);
          break;
        }
      }
    });
}
