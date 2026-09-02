import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { TaskOperationsUseCase } from "../../../application/use-cases/TaskOperationsUseCase.js";
import { ListSpecsUseCase } from "../../../application/use-cases/ListSpecsUseCase.js";
import { ConfigService } from "../../../config/ConfigService.js";
import { PATHS } from "../../../infrastructure/paths.js";
import { translate } from "../../ui/i18n.js";

export function registerTaskResetCommand(task: Command): void {
  task
    .command("reset [spec] [taskId]")
    .description("Reset tasks to pending state without executing")
    .action(async (spec?: string, taskId?: string) => {
      const gw = new NodeWorkspaceGateway(process.cwd());

      const configService = new ConfigService(gw);
      const config = configService.loadConfig();
      const lang = config?.language || "en";

      if (!gw.exists(PATHS.metadata)) {
        console.error(translate("err_not_initialized", lang));
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
      let targetTaskId = taskId;

      if (!targetTaskId) {
        const tasksResult = useCase.getAvailableTasks(specName);

        if (tasksResult.kind === "spec-not-found" || tasksResult.kind === "no-tasks") {
          console.error(translate("err_tasks_dir_not_found", lang, { spec: specName }));
          process.exitCode = 1;
          return;
        }

        const selectedChoice = await select({
          message: translate("reset_select_task", lang),
          choices: [
            { name: translate("menu_back", lang), value: "back" },
            { name: translate("reset_all_option", lang), value: "all" },
            ...tasksResult.tasks.map((t) => ({
              name: `${t.id} - ${t.title}`,
              value: t.id,
            })),
          ],
        });

        if (selectedChoice === "back") {
          if (process.env.CODEFORGE_INTERACTIVE) {
            process.exit(200);
          } else {
            process.exit(0);
          }
        }

        if (selectedChoice !== "all") {
          targetTaskId = selectedChoice;
        }
      }

      const result = useCase.resetTasks(specName, targetTaskId);

      switch (result.kind) {
        case "spec-not-found":
          console.error(translate("err_spec_not_found", lang, { spec: specName }));
          process.exitCode = 1;
          break;
        case "no-execution":
          console.log(translate("status_no_execution", lang, { spec: specName }));
          break;
        case "task-not-found":
          console.error(`\n✗ Task '${result.taskId}' not found in spec '${specName}'.\n`);
          process.exitCode = 1;
          break;
        case "reset-single":
          console.log(
            translate("reset_success_single", lang, {
              taskId: result.taskId,
              spec: specName,
            }),
          );
          break;
        case "reset-all":
          console.log(
            translate("reset_success_all", lang, {
              count: result.count,
              spec: specName,
            }),
          );
          break;
      }
    });
}
