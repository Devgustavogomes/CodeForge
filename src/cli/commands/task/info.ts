import { Command } from "commander";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";
import {
  isPromptCancellation,
  handlePromptCancellation,
  promptSelectIntent,
  promptSelectTask,
} from "../../common/prompts.js";

export async function taskInfoAction(
  intent?: string,
  taskId?: string,
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  let intentName = intent;
  let selectedTask = taskId;

  try {
    // Select Intent
    if (!intentName) {
      const selected = await promptSelectIntent(container, lang, {
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

    // Select Task
    const useCase = container.taskOperationsUseCase;
    if (!selectedTask) {
      const selected = await promptSelectTask(container, intentName, lang);
      if (selected === undefined) {
        return { success: false };
      }
      if (selected === null) {
        return { back: true };
      }
      selectedTask = selected;
    }

    const result = useCase.getTaskInfo(intentName, selectedTask);

  switch (result.kind) {
    case "intent-not-found":
      console.error(`\n✗ No tasks directory found for intent '${intentName}'.\n`);
      process.exitCode = 1;
      return { success: false };
    case "task-not-found":
      console.error(`\n✗ Task '${selectedTask}' not found in intent '${intentName}'.\n`);
      process.exitCode = 1;
      return { success: false };
    case "invalid-json":
      console.error(`\n✗ Error reading task JSON: ${result.message}\n`);
      process.exitCode = 1;
      return { success: false };
    case "info": {
      const taskData = result.task;
      console.log(`\n==================================================`);
      console.log(` TASK: ${taskData.id}`);
      console.log(` TITLE: ${taskData.title}`);
      console.log(`==================================================\n`);

      console.log(
        `DEPENDENCIES: ${taskData.dependencies && taskData.dependencies.length > 0 ? taskData.dependencies.join(", ") : "None"}`,
      );
      console.log(
        `FILES TO MODIFY/CREATE: ${taskData.files && taskData.files.length > 0 ? "\n  - " + taskData.files.join("\n  - ") : "None"}\n`,
      );

      console.log(`--- OBJECTIVE ---`);
      console.log(`${taskData.objective}\n`);

      console.log(`--- CONTEXT ---`);
      console.log(`${taskData.context}\n`);

      console.log(`--- IMPLEMENTATION STEPS ---`);
      console.log(`${taskData.implementation}\n`);

      if (taskData.constraints && taskData.constraints.length > 0) {
        console.log(`--- CONSTRAINTS ---`);
        taskData.constraints.forEach((c: string) => console.log(`- ${c}`));
        console.log();
      }

      if (
        taskData.acceptanceCriteria &&
        taskData.acceptanceCriteria.length > 0
      ) {
        console.log(`--- ACCEPTANCE CRITERIA ---`);
        taskData.acceptanceCriteria.forEach((c: string) =>
          console.log(`- ${c}`),
        );
        console.log();
      }
      return { success: true };
    }
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

export function registerTaskInfoCommand(task: Command): void {
  task
    .command("info [intent] [taskId]")
    .description("View details of a specific task")
    .action(async (intent?: string, taskId?: string) => {
      await taskInfoAction(intent, taskId);
    });
}
