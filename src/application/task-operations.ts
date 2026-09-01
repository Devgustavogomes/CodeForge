import { Task } from "../domain/task.js";
import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { PATHS } from "../infrastructure/paths.js";
import { loadExecutionState, saveExecutionState } from "./execution-state.js";

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

export function markTaskCompleted(
  gw: WorkspaceGateway,
  specName: string,
  taskId: string,
): MarkCompleteResult {
  const state = loadExecutionState(gw, specName);

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

  saveExecutionState(gw, state);
  return { kind: "completed", allCompleted };
}

export function retryTask(
  gw: WorkspaceGateway,
  specName: string,
  taskId: string,
): RetryResult {
  const state = loadExecutionState(gw, specName);

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
  saveExecutionState(gw, state);
  return { kind: "retried" };
}

export function getAvailableTasks(
  gw: WorkspaceGateway,
  specName: string,
): AvailableTasksResult {
  const tasksDir = `${PATHS.tasksDir}/${specName}`;
  if (!gw.exists(tasksDir)) {
    return { kind: "spec-not-found" };
  }

  const taskFiles = gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
  if (taskFiles.length === 0) {
    return { kind: "no-tasks" };
  }

  const tasks: { id: string; title: string }[] = [];
  for (const f of taskFiles) {
    const id = f.replace(".json", "");
    try {
      const content = JSON.parse(gw.readFile(`${tasksDir}/${f}`)) as Task;
      tasks.push({ id, title: content.title || "No title" });
    } catch {
      tasks.push({ id, title: "Invalid task file" });
    }
  }

  return { kind: "tasks", tasks };
}

export function getTaskInfo(
  gw: WorkspaceGateway,
  specName: string,
  taskId: string,
): TaskInfoResult {
  const tasksDir = `${PATHS.tasksDir}/${specName}`;
  if (!gw.exists(tasksDir)) {
    return { kind: "spec-not-found" };
  }

  const taskPath = `${tasksDir}/${taskId}.json`;
  if (!gw.exists(taskPath)) {
    return { kind: "task-not-found" };
  }

  try {
    const taskData = JSON.parse(gw.readFile(taskPath)) as Task;
    return { kind: "info", task: taskData };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { kind: "invalid-json", message: errorMessage };
  }
}
