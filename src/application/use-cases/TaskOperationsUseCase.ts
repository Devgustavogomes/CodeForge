import path from "node:path";
import { Task } from "../../domain/task.js";
import { TaskExecutionState, isTaskIntegrated } from "../../domain/execution.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";
import { ExecutionStateRepository } from "../../infrastructure/repositories/ExecutionStateRepository.js";

import { NodeProcessExecutor } from "../../infrastructure/process/NodeProcessExecutor.js";
import { ProcessExecutor } from "../../infrastructure/process/ProcessExecutor.js";
import { ProtectedOperationResult, taskMutationBlock } from "./TaskStateProtection.js";

export type MarkCompleteResult =
  | ProtectedOperationResult
  | { kind: "not-found" }
  | { kind: "completed"; allCompleted: boolean };

export type RetryResult =
  | ProtectedOperationResult
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
  | ProtectedOperationResult
  | { kind: "intent-not-found" }
  | { kind: "no-execution"; intentName: string }
  | { kind: "all-completed"; intentName: string }
  | { kind: "no-failed-tasks"; intentName: string; pendingCount: number }
  | { kind: "retried"; intentName: string; retriedTasks: string[] };

export type ResetTaskResult =
  | ProtectedOperationResult
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
    private readonly processes: ProcessExecutor = new NodeProcessExecutor(),
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

    const candidate = structuredClone(state);
    candidate.tasks[taskId].status = "completed";
    if (!isTaskIntegrated(candidate, taskId) ||
        !candidate.tasks[taskId].dependencies.every(id => isTaskIntegrated(state, id))) {
      return { kind: "blocked", message: "Manual completion requires a recorded result commit and successful integration, including all dependencies. Run or resume the task to verify, commit, and integrate its result." };
    }
    if (state.tasks[taskId].owner || state.tasks[taskId].status === "running" ||
        state.processes?.some(record => record.taskId === taskId && (record.status === "running" || record.status === "launching"))) {
      return { kind: "blocked", message: "Task ownership is active or unresolved. Resume process recovery before manual completion." };
    }

    state.tasks[taskId].status = "completed";
    state.tasks[taskId].completedAt = new Date().toISOString();

    const allCompleted = Object.keys(state.tasks).every(id => isTaskIntegrated(state, id));

    if (allCompleted && state.delivery?.status === "succeeded" &&
        state.delivery.deliveredCommit === state.lastAcceptedCommit) {
      state.status = "completed";
      state.completedAt = new Date().toISOString();
    }

    this.stateRepo.save(state);
    return { kind: "completed", allCompleted };
  }

  async retryTask(intentName: string, taskId: string): Promise<RetryResult> {
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

    const block = await this.retryBlock(intentName, taskId);
    if (block) return block;
    if (this.stateRepo.load(intentName)?.revision !== state.revision) {
      return { kind: "blocked", message: "Execution changed during ownership inspection. Reload and retry." };
    }

    state.tasks[taskId].status = "pending";
    if (state.status === "failed" || state.status === "completed") {
      state.status = "pending";
      delete state.completedAt;
    }
    this.stateRepo.save(state);
    return { kind: "retried" };
  }

  private async retryBlock(intentName: string, taskId: string): Promise<ProtectedOperationResult | undefined> {
    const state = this.stateRepo.load(intentName)!;
    const task = state.tasks[taskId];
    if (task.integration?.status === "succeeded" || task.integration?.acceptedCommit ||
        task.resultCommit || state.delivery?.status === "succeeded") {
      return { kind: "blocked", message: "Task " + taskId + " already has a committed or integrated result. Resume integration/recovery instead of rerunning its agent." };
    }
    const normalize = (directory: string) => {
      const resolved = path.resolve(directory);
      return process.platform === "win32" ? resolved.toLowerCase() : resolved;
    };
    const records = state.processes?.filter(record => record.taskId === taskId ||
      (task.worktreePath && normalize(record.cwd) === normalize(task.worktreePath))) ?? [];
    if (records.length || task.owner || task.status === "running" ||
        Object.values(task.stages ?? {}).some(stage => stage.status === "running" || stage.status === "blocked")) {
      const checks = records.length ? await Promise.all(records.map(record => this.processes.inspect(record)
        .catch(error => ({ safeToReuse: false, status: "unknown", diagnostics: [String(error)] })))) : [];
      if (!checks.length || checks.some(check => !check.safeToReuse)) {
        return { kind: "blocked", message: "Task " + taskId + " has active or unresolved process ownership. " +
          checks.flatMap(check => check.diagnostics).join(" ") +
          " Inspect previous processes (including descendants) or restart their host before retrying; the worktree is preserved." };
      }
    }
    return undefined;
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

  async retryIntent(intentName: string): Promise<RetryIntentResult> {
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

    for (const [id] of failedTasks) {
      const block = await this.retryBlock(intentName, id);
      if (block) return block;
    }
    if (this.stateRepo.load(intentName)?.revision !== state.revision) {
      return { kind: "blocked", message: "Execution changed during ownership inspection. Reload and retry." };
    }

    const retriedTasks: string[] = [];
    for (const [id, task] of failedTasks) {
      task.status = "pending";
      // Retain stage, diagnostics, timestamps and fixed Git identity for recovery.
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

      const block = taskMutationBlock(state, taskId);
      if (block) return block;
      resetTaskToPending(task);
      state.status = "pending";
      delete state.completedAt;
      this.stateRepo.save(state);

      return { kind: "reset-single", intentName, taskId };
    }

    for (const id of Object.keys(state.tasks)) {
      const block = taskMutationBlock(state, id);
      if (block) return block;
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
