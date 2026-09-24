import { select } from "@inquirer/prompts";
import { Command } from "commander";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";
import { translate } from "../../ui/i18n.js";
import {
  isPromptCancellation,
  handlePromptCancellation,
  promptConfirmAction,
} from "../../common/prompts.js";

export interface TaskDeleteOptions {
  force?: boolean;
}

export async function taskDeleteAction(
  intent?: string,
  taskId?: string,
  options: TaskDeleteOptions = {},
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  let intentName = intent;
  let selectedTaskId = taskId;
  let lang: "en" | "pt" | "es" = "en";

  try {
    const config = container.configService.loadConfig();
    lang = config?.language || "en";

    if (!intentName) {
      const listUseCase = container.listIntentsUseCase;
      const intents = listUseCase.execute();
      if (intents.length === 0) {
        console.error(translate("err_no_intents", lang));
        process.exitCode = 1;
        return { success: false };
      }

      intentName = await select({
        message: translate("task_delete_select_intent", lang),
        choices: [
          { name: translate("menu_back", lang), value: "back" },
          ...intents.map((availableIntent) => ({
            name: availableIntent.name,
            value: availableIntent.name,
          })),
        ],
      });

      if (intentName === "back") {
        return { back: true };
      }
    }

    if (!selectedTaskId) {
      const tasksResult =
        container.taskOperationsUseCase.getAvailableTasks(intentName);

      if (tasksResult.kind === "intent-not-found") {
        console.error(
          translate("task_delete_intent_not_found", lang, { intent: intentName }),
        );
        process.exitCode = 1;
        return { success: false };
      }

      if (tasksResult.kind === "no-tasks") {
        console.error(
          translate("task_delete_no_tasks", lang, { intent: intentName }),
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
      const confirmed = await promptConfirmAction(
        translate("task_delete_confirm", lang, {
          intent: intentName,
          taskId: selectedTaskId,
        }),
        lang,
      );

      if (!confirmed) {
        return { back: true };
      }
    }

    const result = container.deleteTaskUseCase.execute(
      intentName,
      selectedTaskId,
    );

    if (result.kind === "not-initialized") {
      console.error(translate("err_not_initialized", lang));
      process.exitCode = 1;
      return { success: false };
    }

    if (result.kind === "intent-not-found") {
      console.error(
        translate("task_delete_intent_not_found", lang, { intent: intentName }),
      );
      process.exitCode = 1;
      return { success: false };
    }

    if (result.kind === "task-not-found") {
      console.error(
        translate("task_delete_not_found", lang, {
          intent: intentName,
          taskId: selectedTaskId,
        }),
      );
      process.exitCode = 1;
      return { success: false };
    }

    if (result.kind === "deleted") {
      console.log(
        translate("task_delete_success", lang, {
          intent: result.intentName,
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

    return { success: false };
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      return handlePromptCancellation(lang);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(
      translate("task_delete_error", lang, {
        intent: intentName || intent || "",
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
    .command("delete [intent] [taskId]")
    .alias("rm")
    .description("Delete a task and clean up references to it")
    .option("-f, --force", "Skip the deletion confirmation")
    .action(
      async (
        intent?: string,
        taskId?: string,
        options?: TaskDeleteOptions,
      ) => {
        await taskDeleteAction(intent, taskId, options);
      },
    );
}
