import { Task } from "../../domain/task.js";
import { TaskExecutionState } from "../../domain/execution.js";
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
  | { kind: "intent-not-found" }
  | { kind: "no-tasks" }
  | { kind: "tasks"; tasks: { id: string; title: string }[] };

export type TaskInfoResult =
  | { kind: "intent-not-found" }
  | { kind: "task-not-found" }
  | { kind: "invalid-json"; message: string }
  | { kind: "info"; task: Task };

export type RetryIntentResult =
  | { kind: "intent-not-found" }
  | { kind: "no-execution"; intentName: string }
  | { kind: "all-completed"; intentName: string }
  | { kind: "no-failed-tasks"; intentName: string; pendingCount: number }
  | { kind: "retried"; intentName: string; retriedTasks: string[] };

export type ResetTaskResult =
  | { kind: "intent-not-found" }
  | { kind: "no-execution"; intentName: string }
  | { kind: "task-not-found"; taskId: string }
  | { kind: "reset-single"; intentName: string; taskId: string }
  | { kind: "reset-all"; intentName: string; count: number };

function resetTaskToPending(task: TaskExecutionState): void {
  task.status = "pending";
  delete task.startedAt;
  delete task.completedAt;
  delete task.errors;
}

export class TaskOperationsUseCase {
  private readonly stateRepo: ExecutionStateRepository;

  constructor(
    private readonly gw: WorkspaceGateway,
    stateRepo?: ExecutionStateRepository,
  ) {
    this.stateRepo = stateRepo ?? new ExecutionStateRepository(gw);
  }

  private loadTasksFromDisk(intentName: string): Task[] {
    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!this.gw.exists(tasksDir)) {
      return [];
    }
    const files = this.gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
    const tasks: Task[] = [];
    for (const file of files) {
      try {
        const content = this.gw.readFile(`${tasksDir}/${file}`);
        tasks.push(JSON.parse(content) as Task);
      } catch {
        // ignore invalid files
      }
    }
    return tasks;
  }

  private ensureExecutionState(intentName: string) {
    const existing = this.stateRepo.load(intentName);
    if (existing) return existing;

    const diskTasks = this.loadTasksFromDisk(intentName);
    if (diskTasks.length === 0) return null;

    const newState = this.stateRepo.init(intentName, diskTasks);
    newState.status = "pending";
    this.stateRepo.save(newState);
    return newState;
  }

  markTaskCompleted(intentName: string, taskId: string): MarkCompleteResult {
    let state = this.stateRepo.load(intentName);

    if (!state) {
      const diskTasks = this.loadTasksFromDisk(intentName);
      if (diskTasks.length > 0 && diskTasks.some((t) => t.id === taskId)) {
        state = this.stateRepo.init(intentName, diskTasks);
        state.status = "pending";
        this.stateRepo.save(state);
      } else {
        return { kind: "not-found" };
      }
    }

    if (!state.tasks[taskId]) {
      return { kind: "not-found" };
    }

    state.tasks[taskId].status = "completed";
    state.tasks[taskId].completedAt = new Date().toISOString();

    const allCompleted = Object.values(state.tasks).every(
      (t) => t.status === "completed",
    );

    if (allCompleted) {
      state.status = "completed";
      state.completedAt = new Date().toISOString();
    }

    this.stateRepo.save(state);
    return { kind: "completed", allCompleted };
  }

  retryTask(intentName: string, taskId: string): RetryResult {
    const state = this.stateRepo.load(intentName);

    if (!state || !state.tasks[taskId]) {
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
    this.stateRepo.save(state);
    return { kind: "retried" };
  }

  getAvailableTasks(intentName: string): AvailableTasksResult {
    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!this.gw.exists(tasksDir)) {
      return { kind: "intent-not-found" };
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

  getTaskInfo(intentName: string, taskId: string): TaskInfoResult {
    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!this.gw.exists(tasksDir)) {
      return { kind: "intent-not-found" };
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

  retryIntent(intentName: string): RetryIntentResult {
    const intentPath = PATHS.intentFile(intentName);
    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!this.gw.exists(intentPath) && !this.gw.exists(tasksDir)) {
      return { kind: "intent-not-found" };
    }

    const state = this.stateRepo.load(intentName);
    if (!state) {
      return { kind: "no-execution", intentName };
    }

    const taskEntries = Object.entries(state.tasks);
    const failedTasks = taskEntries.filter(([_, t]) => t.status === "failed");

    if (failedTasks.length === 0) {
      const allCompleted =
        taskEntries.length > 0 &&
        taskEntries.every(([_, t]) => t.status === "completed");
      if (allCompleted) {
        return { kind: "all-completed", intentName };
      }

      const pendingCount = taskEntries.filter(
        ([_, t]) => t.status === "pending",
      ).length;
      return { kind: "no-failed-tasks", intentName, pendingCount };
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
    this.stateRepo.save(state);

    return { kind: "retried", intentName, retriedTasks };
  }

  resetTask(intentName: string, taskId: string): ResetTaskResult {
    return this.resetTasks(intentName, taskId);
  }

  resetTasks(intentName: string, taskId?: string): ResetTaskResult {
    const intentPath = PATHS.intentFile(intentName);
    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!this.gw.exists(intentPath) && !this.gw.exists(tasksDir)) {
      return { kind: "intent-not-found" };
    }

    const state = this.ensureExecutionState(intentName);
    if (!state) {
      return { kind: "no-execution", intentName };
    }

    if (taskId !== undefined) {
      const task = state.tasks[taskId];
      if (!task) {
        return { kind: "task-not-found", taskId };
      }

      resetTaskToPending(task);
      state.status = "pending";
      delete state.completedAt;
      this.stateRepo.save(state);

      return { kind: "reset-single", intentName, taskId };
    }

    const taskList = Object.values(state.tasks);
    for (const task of taskList) {
      resetTaskToPending(task);
    }

    state.status = "pending";
    delete state.startedAt;
    delete state.completedAt;
    this.stateRepo.save(state);

    return { kind: "reset-all", intentName, count: taskList.length };
  }
}
