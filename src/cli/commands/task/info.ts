import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { createAppContainer } from "../../../infrastructure/container.js";
import { translate } from "../../ui/i18n.js";
import { ActionResult } from "../../types.js";

export async function taskInfoAction(spec?: string, taskId?: string): Promise<ActionResult> {
  const container = createAppContainer();
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";
  
  let specName = spec;
  let selectedTask = taskId;

  // Select Spec
  if (!specName) {
    const specs = container.listSpecsUseCase.execute();
    if (specs.length === 0) {
      console.error("\n✗ No specs found.\n");
      process.exitCode = 1;
      return { success: false };
    }

    specName = await select({
      message: "Select a spec:",
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...specs.map((s) => ({ name: s.name, value: s.name }))
      ],
    });

    if (specName === "back") {
      return { back: true };
    }
  }

  // Select Task
  const useCase = container.taskOperationsUseCase;
  if (!selectedTask) {
    const tasksResult = useCase.getAvailableTasks(specName);
    if (tasksResult.kind === "spec-not-found") {
      console.error(
        `\n✗ No tasks found for spec '${specName}'. Run 'plan generate' first.\n`,
      );
      process.exitCode = 1;
      return { success: false };
    }
    if (tasksResult.kind === "no-tasks") {
      console.error(`\n✗ No tasks found for spec '${specName}'.\n`);
      process.exitCode = 1;
      return { success: false };
    }

    selectedTask = await select({
      message: `Select a task from '${specName}':`,
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...tasksResult.tasks.map((t) => ({ name: `${t.id} - ${t.title}`, value: t.id }))
      ],
    });

    if (selectedTask === "back") {
      return { back: true };
    }
  }

  const result = useCase.getTaskInfo(specName, selectedTask as string);

  switch (result.kind) {
    case "spec-not-found":
      console.error(`\n✗ No tasks directory found for spec '${specName}'.\n`);
      process.exitCode = 1;
      return { success: false };
    case "task-not-found":
      console.error(`\n✗ Task '${selectedTask}' not found in spec '${specName}'.\n`);
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
  }
}

export function registerTaskInfoCommand(task: Command): void {
  task
    .command("info [spec] [taskId]")
    .description("View details of a specific task")
    .action(async (spec?: string, taskId?: string) => {
      await taskInfoAction(spec, taskId);
    });
}
