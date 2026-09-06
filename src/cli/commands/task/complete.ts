import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { createAppContainer } from "../../../infrastructure/container.js";
import { translate } from "../../ui/i18n.js";
import { ActionResult } from "../../menu/types.js";

export async function taskCompleteAction(specName?: string, taskId?: string): Promise<ActionResult> {
  const container = createAppContainer();
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  let selectedSpec = specName;

  if (!selectedSpec) {
    const specs = container.listSpecsUseCase.execute();
    if (specs.length === 0) {
      console.error("\n✗ No specs found.\n");
      process.exitCode = 1;
      return { success: false };
    }

    selectedSpec = await select({
      message: "Select a spec:",
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...specs.map((s) => ({ name: s.name, value: s.name })),
      ],
    });

    if (selectedSpec === "back") {
      return { back: true };
    }
  }

  const useCase = container.taskOperationsUseCase;
  let selectedTask = taskId;

  if (!selectedTask) {
    const tasksResult = useCase.getAvailableTasks(selectedSpec);
    if (tasksResult.kind === "spec-not-found" || tasksResult.kind === "no-tasks") {
      console.error(`\n✗ No tasks found for spec '${selectedSpec}'.\n`);
      process.exitCode = 1;
      return { success: false };
    }

    selectedTask = await select({
      message: `Select a task from '${selectedSpec}':`,
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...tasksResult.tasks.map((t) => ({ name: `${t.id} - ${t.title}`, value: t.id })),
      ],
    });

    if (selectedTask === "back") {
      return { back: true };
    }
  }

  const result = useCase.markTaskCompleted(selectedSpec, selectedTask);

  switch (result.kind) {
    case "not-found":
      console.error(
        `\n✗ Failed to mark task as completed. Check if spec '${selectedSpec}' is running and task '${selectedTask}' exists.\n`,
      );
      process.exitCode = 1;
      return { success: false };
    case "completed":
      console.log(
        `\n✓ Task '${selectedTask}' for spec '${selectedSpec}' marked as completed.`,
      );
      if (result.allCompleted) {
        console.log(
          `\n🎉 All tasks for spec '${selectedSpec}' are completed! Execution status updated to 'completed'.\n`,
        );
      } else {
        console.log(
          `\n💡 Tip: Open a NEW, clean session in your AI agent before starting the next task.`,
        );
        console.log(
          `Then, run \`codeforge run ${selectedSpec}\` to get the next task.\n`,
        );
      }
      return { success: true };
  }
}

export function registerTaskCompleteCommand(task: Command): void {
  task
    .command("complete [spec-name] [task-id]")
    .description("Mark a specific task as completed manually")
    .action(async (specName?: string, taskId?: string) => {
      await taskCompleteAction(specName, taskId);
    });
}
