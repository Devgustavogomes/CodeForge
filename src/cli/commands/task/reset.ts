import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { PATHS } from "../../../infrastructure/paths.js";
import { translate } from "../../ui/i18n.js";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";
import {
  isPromptCancellation,
  handlePromptCancellation,
  promptSelectIntent,
} from "../../common/prompts.js";

export async function taskResetAction(
  intent?: string,
  taskId?: string,
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  if (!container.gw.exists(PATHS.metadata)) {
    console.error(translate("err_not_initialized", lang));
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
    let targetTaskId = taskId;

    if (!targetTaskId) {
      const tasksResult = useCase.getAvailableTasks(intentName);

      if (tasksResult.kind !== "tasks") {
        console.error(translate("err_tasks_dir_not_found", lang, { intent: intentName }));
        process.exitCode = 1;
        return { success: false };
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
        return { back: true };
      }

      if (selectedChoice !== "all") {
        targetTaskId = selectedChoice;
      }
    }

    const result = useCase.resetTasks(intentName, targetTaskId);

    switch (result.kind) {
      case "intent-not-found":
        console.error(translate("err_intent_not_found", lang, { intent: intentName }));
        process.exitCode = 1;
        return { success: false };
      case "no-execution":
        console.log(translate("status_no_execution", lang, { intent: intentName }));
        return { success: true };
      case "task-not-found":
        console.error(`\n✗ Task '${result.taskId}' not found in intent '${intentName}'.\n`);
        process.exitCode = 1;
        return { success: false };
      case "reset-single":
        console.log(
          translate("reset_success_single", lang, {
            taskId: result.taskId,
            intent: intentName,
          }),
        );
        return { success: true };
      case "reset-all":
        console.log(
          translate("reset_success_all", lang, {
            count: result.count,
            intent: intentName,
          }),
        );
        return { success: true };
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

export function registerTaskResetCommand(task: Command): void {
  task
    .command("reset [intent] [taskId]")
    .description("Reset tasks to pending state without executing")
    .action(async (intent?: string, taskId?: string) => {
      await taskResetAction(intent, taskId);
    });
}
