import { Command } from "commander";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";
import {
  isPromptCancellation,
  handlePromptCancellation,
  promptSelectIntent,
  promptSelectTask,
} from "../../common/prompts.js";

export async function taskCompleteAction(
  intentName?: string,
  taskId?: string,
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  let selectedIntent = intentName;

  try {
    if (!selectedIntent) {
      const selected = await promptSelectIntent(container, lang, {
        messageKey: "run_select_intent",
      });

      if (selected === undefined) {
        return { success: false };
      }
      if (selected === null) {
        return { back: true };
      }
      selectedIntent = selected;
    }

    const useCase = container.taskOperationsUseCase;
    let selectedTask = taskId;

    if (!selectedTask) {
      const selected = await promptSelectTask(container, selectedIntent, lang);
      if (selected === undefined) {
        return { success: false };
      }
      if (selected === null) {
        return { back: true };
      }
      selectedTask = selected;
    }

    const result = useCase.markTaskCompleted(selectedIntent, selectedTask);

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
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      return handlePromptCancellation(lang);
    }
    throw error;
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
