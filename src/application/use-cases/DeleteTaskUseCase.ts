import { TaskStatus, IntentExecutionState } from "../../domain/execution.js";
import { Task } from "../../domain/task.js";
import { PATHS } from "../../infrastructure/paths.js";
import { ExecutionStateRepository } from "../../infrastructure/repositories/ExecutionStateRepository.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";

export type DeleteTaskResult =
  | { kind: "not-initialized" }
  | { kind: "intent-not-found" }
  | { kind: "task-not-found" }
  | {
      kind: "deleted";
      intentName: string;      taskId: string;
      cleanedDependenciesCount: number;
    };

interface TaskFileUpdate {
  path: string;
  task: Task;
}

function consolidateStatus(state: IntentExecutionState): TaskStatus {
  const tasks = Object.values(state.tasks);

  if (tasks.every((task) => task.status === "completed")) {
    return "completed";
  }
  if (tasks.some((task) => task.status === "failed")) {
    return "failed";
  }
  if (tasks.some((task) => task.status === "running")) {
    return "running";
  }
  return "pending";
}

export class DeleteTaskUseCase {
  constructor(
    private readonly gw: WorkspaceGateway,
    private readonly stateRepo: ExecutionStateRepository,
  ) {}

  execute(intentName: string, taskId: string): DeleteTaskResult {
    if (!this.gw.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const intentExists = this.gw.exists(PATHS.intentFile(intentName));
    if (!intentExists) {
      return { kind: "intent-not-found" };
    }

    const taskPath = PATHS.taskFile(intentName, taskId);
    if (!this.gw.exists(taskPath)) {
      return { kind: "task-not-found" };
    }

    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    const siblingUpdates = this.collectSiblingUpdates(
      tasksDir,
      `${taskId}.json`,
      taskId,
    );
    const state = this.stateRepo.load(intentName);

    for (const update of siblingUpdates) {
      this.gw.writeFile(update.path, JSON.stringify(update.task, null, 2));
    }
    this.gw.deleteFile(taskPath);

    if (state) {
      this.cleanExecutionState(state, taskId);
      this.stateRepo.save(state);
    }

    return {
      kind: "deleted",
      intentName,      taskId,
      cleanedDependenciesCount: siblingUpdates.length,
    };
  }

  private collectSiblingUpdates(
    tasksDir: string,
    targetFileName: string,
    taskId: string,
  ): TaskFileUpdate[] {
    const updates: TaskFileUpdate[] = [];
    const siblingFiles = this.gw
      .listDir(tasksDir)
      .filter((file) => file.endsWith(".json") && file !== targetFileName);

    for (const file of siblingFiles) {
      const path = `${tasksDir}/${file}`;
      const task = JSON.parse(this.gw.readFile(path)) as Task;
      const dependencies = task.dependencies.filter(
        (dependency) => dependency !== taskId,
      );

      if (dependencies.length !== task.dependencies.length) {
        task.dependencies = dependencies;
        updates.push({ path, task });
      }
    }

    return updates;
  }

  private cleanExecutionState(
    state: IntentExecutionState,
    taskId: string,
  ): void {
    delete state.tasks[taskId];

    for (const task of Object.values(state.tasks)) {
      task.dependencies = task.dependencies.filter(
        (dependency) => dependency !== taskId,
      );
    }

    state.status = consolidateStatus(state);
    if (state.status === "completed" || state.status === "failed") {
      state.completedAt ??= new Date().toISOString();
    } else {
      delete state.completedAt;
    }
  }
}
