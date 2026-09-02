import { Task } from "../../domain/task.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";
import { ExecutionStateRepository } from "../../infrastructure/repositories/ExecutionStateRepository.js";

export type MarkCompleteResult =
  | { kind: "not-found" }
  | { kind: "completed"; allCompleted: boolean };

export type RetryResult =
  | { kind: "not-found" }
  | { kind: "already-pending" }
  | { kind: "already-completed" }
  | { kind: "retried" };

export type AvailableTasksResult =
  | { kind: "spec-not-found" }
  | { kind: "no-tasks" }
  | { kind: "tasks"; tasks: { id: string; title: string }[] };

export type TaskInfoResult =
  | { kind: "spec-not-found" }
  | { kind: "task-not-found" }
  | { kind: "invalid-json"; message: string }
  | { kind: "info"; task: Task };

export type RetrySpecResult =
  | { kind: "spec-not-found" }
  | { kind: "no-execution"; specName: string }
  | { kind: "all-completed"; specName: string }
  | { kind: "no-failed-tasks"; specName: string; pendingCount: number }
  | { kind: "retried"; specName: string; retriedTasks: string[] };

export type ResetTaskResult =
  | { kind: "spec-not-found" }
  | { kind: "no-execution"; specName: string }
  | { kind: "task-not-found"; taskId: string }
  | { kind: "reset-single"; specName: string; taskId: string }
  | { kind: "reset-all"; specName: string; count: number };

export class TaskOperationsUseCase {
  constructor(private readonly gw: WorkspaceGateway) {}

  markTaskCompleted(
    specName: string,
    taskId: string,
  ): MarkCompleteResult {
    const repo = new ExecutionStateRepository(this.gw);
    const state = repo.load(specName);

    if (!state) {
      return { kind: "not-found" };
    }
    if (!state.tasks[taskId]) {
      return { kind: "not-found" };
    }

    state.tasks[taskId].status = "completed";

    // Check if all tasks are now completed
    const allCompleted = Object.values(state.tasks).every(
      (t) => t.status === "completed",
    );

    if (allCompleted) {
      state.status = "completed";
    }

    repo.save(state);
    return { kind: "completed", allCompleted };
  }

  retryTask(
    specName: string,
    taskId: string,
  ): RetryResult {
    const repo = new ExecutionStateRepository(this.gw);
    const state = repo.load(specName);

    if (!state) {
      return { kind: "not-found" };
    }
    if (!state.tasks[taskId]) {
      return { kind: "not-found" };
    }

    const currentStatus = state.tasks[taskId].status;

    if (currentStatus === "pending") {
      return { kind: "already-pending" };
    }

    if (currentStatus === "completed") {
      return { kind: "already-completed" };
    }

    state.tasks[taskId].status = "pending";
    if (state.status === "failed" || state.status === "completed") {
      state.status = "pending";
      delete state.completedAt;
    }
    repo.save(state);
    return { kind: "retried" };
  }

  getAvailableTasks(
    specName: string,
  ): AvailableTasksResult {
    const tasksDir = `${PATHS.tasksDir}/${specName}`;
    if (!this.gw.exists(tasksDir)) {
      return { kind: "spec-not-found" };
    }

    const taskFiles = this.gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
    if (taskFiles.length === 0) {
      return { kind: "no-tasks" };
    }

    const tasks: { id: string; title: string }[] = [];
    for (const f of taskFiles) {
      const id = f.replace(".json", "");
      try {
        const content = JSON.parse(this.gw.readFile(`${tasksDir}/${f}`)) as Task;
        tasks.push({ id, title: content.title || "No title" });
      } catch {
        tasks.push({ id, title: "Invalid task file" });
      }
    }

    return { kind: "tasks", tasks };
  }

  getTaskInfo(
    specName: string,
    taskId: string,
  ): TaskInfoResult {
    const tasksDir = `${PATHS.tasksDir}/${specName}`;
    if (!this.gw.exists(tasksDir)) {
      return { kind: "spec-not-found" };
    }

    const taskPath = `${tasksDir}/${taskId}.json`;
    if (!this.gw.exists(taskPath)) {
      return { kind: "task-not-found" };
    }

    try {
      const taskData = JSON.parse(this.gw.readFile(taskPath)) as Task;
      return { kind: "info", task: taskData };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { kind: "invalid-json", message: errorMessage };
    }
  }

  retrySpec(specName: string): RetrySpecResult {
    const specPath = PATHS.specFile(specName);
    const tasksDir = `${PATHS.tasksDir}/${specName}`;
    if (!this.gw.exists(specPath) && !this.gw.exists(tasksDir)) {
      return { kind: "spec-not-found" };
    }

    const repo = new ExecutionStateRepository(this.gw);
    const state = repo.load(specName);
    if (!state) {
      return { kind: "no-execution", specName };
    }

    const taskEntries = Object.entries(state.tasks);
    const failedTasks = taskEntries.filter(([_, t]) => t.status === "failed");

    if (failedTasks.length === 0) {
      const allCompleted =
        taskEntries.length > 0 &&
        taskEntries.every(([_, t]) => t.status === "completed");
      if (allCompleted) {
        return { kind: "all-completed", specName };
      }

      const pendingCount = taskEntries.filter(
        ([_, t]) => t.status === "pending",
      ).length;
      return { kind: "no-failed-tasks", specName, pendingCount };
    }

    const retriedTasks: string[] = [];
    for (const [id, task] of failedTasks) {
      task.status = "pending";
      delete task.startedAt;
      delete task.completedAt;
      retriedTasks.push(id);
    }

    state.status = "pending";
    delete state.completedAt;
    repo.save(state);

    return { kind: "retried", specName, retriedTasks };
  }

  resetTasks(specName: string, taskId?: string): ResetTaskResult {
    const specPath = PATHS.specFile(specName);
    const tasksDir = `${PATHS.tasksDir}/${specName}`;
    if (!this.gw.exists(specPath) && !this.gw.exists(tasksDir)) {
      return { kind: "spec-not-found" };
    }

    const repo = new ExecutionStateRepository(this.gw);
    const state = repo.load(specName);
    if (!state) {
      return { kind: "no-execution", specName };
    }

    if (taskId !== undefined) {
      const task = state.tasks[taskId];
      if (!task) {
        return { kind: "task-not-found", taskId };
      }

      task.status = "pending";
      delete task.startedAt;
      delete task.completedAt;
      delete task.errors;

      state.status = "pending";
      delete state.completedAt;
      repo.save(state);

      return { kind: "reset-single", specName, taskId };
    }

    const taskList = Object.values(state.tasks);
    for (const task of taskList) {
      task.status = "pending";
      delete task.startedAt;
      delete task.completedAt;
      delete task.errors;
    }

    state.status = "pending";
    delete state.startedAt;
    delete state.completedAt;
    repo.save(state);

    return { kind: "reset-all", specName, count: taskList.length };
  }
}
