import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { AgentRunner, TaskContext } from "../runners/AgentRunner.js";
import { DAGResolver } from "./DAGResolver.js";
import { Task } from "../domain/task.js";
import { buildContextPrompt } from "../application/context-builder.js";
import { PATHS } from "../infrastructure/paths.js";

import {
  loadExecutionState,
  saveExecutionState,
  initExecutionState,
} from "../application/execution-state.js";
import { getSpecStatus, formatStatusOutput } from "../application/status.js";

export class TaskScheduler {
  constructor(
    private gw: WorkspaceGateway,
    private runner: AgentRunner,
  ) {}

  private loadTasks(specName: string): Task[] {
    const tasksDir = `${PATHS.tasksDir}/${specName}`;
    if (!this.gw.exists(tasksDir)) {
      return [];
    }
    const files = this.gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
    const tasks: Task[] = [];
    for (const file of files) {
      const content = this.gw.readFile(`${tasksDir}/${file}`);
      tasks.push(JSON.parse(content) as Task);
    }
    return tasks;
  }

  async run(specName: string, model?: string): Promise<void> {
    const tasks = this.loadTasks(specName);
    if (tasks.length === 0) {
      console.log(`\n✗ No tasks found for spec: ${specName}\n`);
      return;
    }

    let state = loadExecutionState(this.gw, specName);
    if (!state) {
      state = initExecutionState(specName, tasks);
      saveExecutionState(this.gw, state);
    } else {
      if (state.status === "completed") {
        const result = getSpecStatus(this.gw, specName);
        if (result.kind === "status") {
          console.log(formatStatusOutput(result));
        }
        return;
      }
      state.status = "running";
      saveExecutionState(this.gw, state);
    }

    const resolver = new DAGResolver();
    const specExecDir = `${PATHS.executionsDir}/${specName}`;
    if (!this.gw.exists(specExecDir)) {
      this.gw.mkdir(specExecDir);
    }

    // Watch mode UI setup
    process.stdout.write("\x1b[?1049h\x1b[?25l");

    let isCleaningUp = false;
    const cleanup = () => {
      if (isCleaningUp) return;
      isCleaningUp = true;
      if (renderInterval) clearInterval(renderInterval);
      process.stdout.write("\x1b[?25h\x1b[?1049l");
    };

    const render = () => {
      if (isCleaningUp) return;
      const result = getSpecStatus(this.gw, specName);
      process.stdout.write("\x1b[H");
      if (result.kind === "status") {
        process.stdout.write(formatStatusOutput(result));
        process.stdout.write("  \x1b[2mExecuting... (Ctrl+C to exit)\x1b[0m\n\n");
        process.stdout.write("\x1b[J"); // Clear remaining old lines
      }
    };

    const renderInterval = setInterval(render, 500);

    const sigintHandler = () => {
      cleanup();
      process.exit(0);
    };
    process.on("SIGINT", sigintHandler);

    render(); // Initial render

    try {
      while (true) {
        state = loadExecutionState(this.gw, specName);
        if (!state) break;

        if (state.status === "completed") {
          cleanup();
          const result = getSpecStatus(this.gw, specName);
          if (result.kind === "status") {
            console.log(formatStatusOutput(result));
          }
          break;
        }

        const readyTaskIds = resolver.getReadyTasks(state);

        const runningTasksCount = Object.values(state.tasks).filter(
          (t) => t.status === "running",
        ).length;
        const pendingTasksCount = Object.values(state.tasks).filter(
          (t) => t.status === "pending",
        ).length;

        if (readyTaskIds.length === 0) {
          if (runningTasksCount === 0 && pendingTasksCount > 0) {
            cleanup();
            console.error("\n✗ Deadlock detected or missing dependencies.\n");
            process.exitCode = 1;
            break;
          }
          if (runningTasksCount === 0 && pendingTasksCount === 0) {
            state.status = "completed";
            state.completedAt = new Date().toISOString();
            saveExecutionState(this.gw, state);
            cleanup();
            const result = getSpecStatus(this.gw, specName);
            if (result.kind === "status") {
              console.log(formatStatusOutput(result));
            }
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }

        const executionPromises = readyTaskIds.map(async (taskId) => {
          const task = tasks.find((t) => t.id === taskId);
          if (!task) return;

          let currentState = loadExecutionState(this.gw, specName);
          if (currentState) {
            currentState.tasks[task.id].status = "running";
            currentState.tasks[task.id].startedAt = new Date().toISOString();
            if (!currentState.startedAt) currentState.startedAt = new Date().toISOString();
            saveExecutionState(this.gw, currentState);
            render();
          }

          const promptPath = `${specExecDir}/${task.id}.temp.prompt.md`;
          const promptContent = buildContextPrompt(this.gw, specName, task);
          this.gw.writeFile(promptPath, promptContent);

          const context: TaskContext = {
            promptFilePath: promptPath,
            specName,
            taskId: task.id,
            model,
            silent: true,
          };

          try {
            await this.runner.execute(context);

            let postState = loadExecutionState(this.gw, specName);
            if (postState) {
              postState.tasks[task.id].status = "completed";
              postState.tasks[task.id].completedAt = new Date().toISOString();
              saveExecutionState(this.gw, postState);
              render();
            }
          } catch (error) {
            let errState = loadExecutionState(this.gw, specName);
            if (errState) {
              errState.tasks[task.id].status = "failed";
              errState.tasks[task.id].completedAt = new Date().toISOString();
              saveExecutionState(this.gw, errState);
              render();
            }
          } finally {
            this.gw.deleteFile(promptPath);
          }
        });

        await Promise.all(executionPromises);
      }
    } finally {
      cleanup();
      process.removeListener("SIGINT", sigintHandler);
    }
  }
}
