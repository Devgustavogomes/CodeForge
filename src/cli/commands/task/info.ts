import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../../application/plan.js";
import fs from "node:fs";
import path from "node:path";

export function registerTaskInfoCommand(task: Command): void {
  task
    .command("info [spec] [taskId]")
    .description("View details of a specific task")
    .action(async (spec?: string, taskId?: string) => {
      const workspacePath = process.cwd();
      let specName = spec;
      let selectedTask = taskId;

      // Select Spec
      if (!specName) {
        const specs = getAvailableSpecs(workspacePath);
        if (specs.length === 0) {
          console.error("\n✗ No specs found.\n");
          process.exitCode = 1;
          return;
        }

        specName = await select({
          message: "Select a spec:",
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      // Read tasks for the selected spec
      const tasksDir = path.join(
        workspacePath,
        ".codeforge",
        "tasks",
        specName,
      );
      if (!fs.existsSync(tasksDir)) {
        console.error(
          `\n✗ No tasks found for spec '${specName}'. Run 'plan generate' first.\n`,
        );
        process.exitCode = 1;
        return;
      }

      const taskFiles = fs
        .readdirSync(tasksDir)
        .filter((f) => f.endsWith(".json"));
      if (taskFiles.length === 0) {
        console.error(`\n✗ No tasks found for spec '${specName}'.\n`);
        process.exitCode = 1;
        return;
      }

      // Select Task
      if (!selectedTask) {
        selectedTask = await select({
          message: `Select a task from '${specName}':`,
          choices: taskFiles.map((f) => {
            const id = f.replace(".json", "");
            // Peek at title
            try {
              const content = JSON.parse(
                fs.readFileSync(path.join(tasksDir, f), "utf-8"),
              );
              return { name: `${id} - ${content.title}`, value: id };
            } catch {
              return { name: id, value: id };
            }
          }),
        });
      }

      const taskPath = path.join(tasksDir, `${selectedTask}.json`);
      if (!fs.existsSync(taskPath)) {
        console.error(
          `\n✗ Task '${selectedTask}' not found in spec '${specName}'.\n`,
        );
        process.exitCode = 1;
        return;
      }

      try {
        const taskData = JSON.parse(fs.readFileSync(taskPath, "utf-8"));
        console.log(`\n==================================================`);
        console.log(` TASK: ${taskData.id}`);
        console.log(` TITLE: ${taskData.title}`);
        console.log(`==================================================\n`);

        // Print nicely using YAML for readability, or manually format
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
      } catch (err) {
        console.error(`\n✗ Error reading task JSON: ${err}\n`);
        process.exitCode = 1;
      }
    });
}
