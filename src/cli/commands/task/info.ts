import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { createAppContainer } from "../../../infrastructure/container.js";
import { translate } from "../../ui/i18n.js";
import { ActionResult } from "../../types.js";

export async function taskInfoAction(intent?: string, taskId?: string): Promise<ActionResult> {
  const container = createAppContainer();
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  let intentName = intent;
  let selectedTask = taskId;

  // Select Intent
  if (!intentName) {
    const listUseCase = container.listIntentsUseCase ?? container.listIntentsUseCase;
    const intents = listUseCase.execute();
    if (intents.length === 0) {
      console.error(translate("err_no_intents", lang));
      process.exitCode = 1;
      return { success: false };
    }

    intentName = await select({
      message: translate("run_select_intent", lang),
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...intents.map((s) => ({ name: s.name, value: s.name }))
      ],
    });

    if (intentName === "back") {
      return { back: true };
    }
  }

  // Select Task
  const useCase = container.taskOperationsUseCase;
  if (!selectedTask) {
    const tasksResult = useCase.getAvailableTasks(intentName);
    if (tasksResult.kind === "intent-not-found") {
      console.error(
        translate("err_tasks_dir_not_found", lang, { intent: intentName,}),
      );
      process.exitCode = 1;
      return { success: false };
    }
    if (tasksResult.kind === "no-tasks") {
      console.error(translate("task_delete_no_tasks", lang, { intent: intentName,}));
      process.exitCode = 1;
      return { success: false };
    }

    selectedTask = await select({
      message: `Select a task from '${intentName}':`,
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...tasksResult.tasks.map((t) => ({ name: `${t.id} - ${t.title}`, value: t.id }))
      ],
    });

    if (selectedTask === "back") {
      return { back: true };
    }
  }

  const result = useCase.getTaskInfo(intentName, selectedTask as string);

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
}

export function registerTaskInfoCommand(task: Command): void {
  task
    .command("info [intent] [taskId]")
    .description("View details of a specific task")
    .action(async (intent?: string, taskId?: string) => {
      await taskInfoAction(intent, taskId);
    });
}
