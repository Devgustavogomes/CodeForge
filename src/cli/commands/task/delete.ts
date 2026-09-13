import { confirm, select } from "@inquirer/prompts";
import { Command } from "commander";
import { createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";
import { translate } from "../../ui/i18n.js";

export interface TaskDeleteOptions {
  force?: boolean;
}

function isPromptCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "ExitPromptError";
}

export async function taskDeleteAction(
  spec?: string,
  taskId?: string,
  options: TaskDeleteOptions = {},
): Promise<ActionResult> {
  let specName = spec;
  let selectedTaskId = taskId;
  let lang: "en" | "pt" | "es" = "en";

  try {
    const container = createAppContainer();
    const config = container.configService.loadConfig();
    lang = config?.language || "en";

    if (!specName) {
      const specs = container.listSpecsUseCase.execute();
      if (specs.length === 0) {
        console.error(translate("err_no_specs", lang));
        process.exitCode = 1;
        return { success: false };
      }

      specName = await select({
        message: translate("task_delete_select_spec", lang),
        choices: [
          { name: translate("menu_back", lang), value: "back" },
          ...specs.map((availableSpec) => ({
            name: availableSpec.name,
            value: availableSpec.name,
          })),
        ],
      });

      if (specName === "back") {
        return { back: true };
      }
    }

    if (!selectedTaskId) {
      const tasksResult =
        container.taskOperationsUseCase.getAvailableTasks(specName);

      if (tasksResult.kind === "spec-not-found") {
        console.error(
          translate("task_delete_spec_not_found", lang, { spec: specName }),
        );
        process.exitCode = 1;
        return { success: false };
      }

      if (tasksResult.kind === "no-tasks") {
        console.error(
          translate("task_delete_no_tasks", lang, { spec: specName }),
        );
        process.exitCode = 1;
        return { success: false };
      }

      selectedTaskId = await select({
        message: translate("task_delete_select", lang),
        choices: [
          { name: translate("menu_back", lang), value: "back" },
          ...tasksResult.tasks.map((task) => ({
            name: translate("task_delete_choice", lang, {
              taskId: task.id,
              title: task.title,
            }),
            value: task.id,
          })),
        ],
      });

      if (selectedTaskId === "back") {
        return { back: true };
      }
    }

    if (!options.force) {
      const confirmed = await confirm({
        message: translate("task_delete_confirm", lang, {
          spec: specName,
          taskId: selectedTaskId,
        }),
        default: false,
      });

      if (!confirmed) {
        console.log(translate("delete_cancelled", lang));
        return { back: true };
      }
    }

    const result = container.deleteTaskUseCase.execute(
      specName,
      selectedTaskId,
    );
    switch (result.kind) {
      case "not-initialized":
        console.error(translate("err_not_initialized", lang));
        process.exitCode = 1;
        return { success: false };
      case "spec-not-found":
        console.error(
          translate("task_delete_spec_not_found", lang, { spec: specName }),
        );
        process.exitCode = 1;
        return { success: false };
      case "task-not-found":
        console.error(
          translate("task_delete_not_found", lang, {
            spec: specName,
            taskId: selectedTaskId,
          }),
        );
        process.exitCode = 1;
        return { success: false };
      case "deleted":
        console.log(
          translate("task_delete_success", lang, {
            spec: result.specName,
            taskId: result.taskId,
          }),
        );
        console.log(
          translate("task_delete_cleanup_count", lang, {
            count: result.cleanedDependenciesCount,
          }),
        );
        return { success: true };
    }
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      console.log(translate("delete_cancelled", lang));
      return { back: true };
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(
      translate("task_delete_error", lang, {
        spec: specName || spec || "",
        taskId: selectedTaskId || taskId || "",
        error: message,
      }),
    );
    process.exitCode = 1;
    return { success: false };
  }
}

export function registerTaskDeleteCommand(task: Command): void {
  task
    .command("delete [spec] [taskId]")
    .alias("rm")
    .description("Delete a task and clean up references to it")
    .option("-f, --force", "Skip the deletion confirmation")
    .action(
      async (
        spec?: string,
        taskId?: string,
        options?: TaskDeleteOptions,
      ) => {
        await taskDeleteAction(spec, taskId, options);
      },
    );
}
