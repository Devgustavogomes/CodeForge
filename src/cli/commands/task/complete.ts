import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { createAppContainer } from "../../../infrastructure/container.js";
import { translate } from "../../ui/i18n.js";
import { ActionResult } from "../../types.js";

export async function taskCompleteAction(intentName?: string, taskId?: string): Promise<ActionResult> {
  const container = createAppContainer();
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  let selectedIntent = intentName;

  if (!selectedIntent) {
    const listUseCase = container.listIntentsUseCase ?? container.listIntentsUseCase;
    const intents = listUseCase.execute();
    if (intents.length === 0) {
      console.error(translate("err_no_intents", lang));
      process.exitCode = 1;
      return { success: false };
    }

    selectedIntent = await select({
      message: translate("run_select_intent", lang),
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...intents.map((s) => ({ name: s.name, value: s.name })),
      ],
    });

    if (selectedIntent === "back") {
      return { back: true };
    }
  }

  const useCase = container.taskOperationsUseCase;
  let selectedTask = taskId;

  if (!selectedTask) {
    const tasksResult = useCase.getAvailableTasks(selectedIntent);
    if (tasksResult.kind !== "tasks") {
      console.error(translate("task_delete_no_tasks", lang, { intent: selectedIntent,}));
      process.exitCode = 1;
      return { success: false };
    }

    selectedTask = await select({
      message: `Select a task from '${selectedIntent}':`,
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...tasksResult.tasks.map((t) => ({ name: `${t.id} - ${t.title}`, value: t.id })),
      ],
    });

    if (selectedTask === "back") {
      return { back: true };
    }
  }

  const result = useCase.markTaskCompleted(selectedIntent, selectedTask as string);

  switch (result.kind) {
    case "not-found":
      console.error(
        `\n✗ Failed to mark task as completed. Check if intent '${selectedIntent}' is running and task '${selectedTask}' exists.\n`,
      );
      process.exitCode = 1;
      return { success: false };
    case "completed":
      console.log(
        `\n✓ Task '${selectedTask}' for intent '${selectedIntent}' marked as completed.`,
      );
      if (result.allCompleted) {
        console.log(
          `\n🎉 All tasks for intent '${selectedIntent}' are completed! Execution status updated to 'completed'.\n`,
        );
      } else {
        console.log(
          `\n💡 Tip: Open a NEW, clean session in your AI agent before starting the next task.`,
        );
        console.log(
          `Then, run \`codeforge run ${selectedIntent}\` to get the next task.\n`,
        );
      }
      return { success: true };
  }
}

export function registerTaskCompleteCommand(task: Command): void {
  task
    .command("complete [intent-name] [task-id]")
    .description("Mark a specific task as completed manually")
    .action(async (intentName?: string, taskId?: string) => {
      await taskCompleteAction(intentName, taskId);
    });
}
