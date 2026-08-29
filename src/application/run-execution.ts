import { SpecExecutionState } from "../domain/execution.js";
import { Task } from "../domain/task.js";
import { buildContextPrompt } from "./context-builder.js";
import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { PATHS } from "../infrastructure/paths.js";

export type RunResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "finished" }
  | { kind: "error"; message: string }
  | { kind: "task-ready"; taskId: string; promptPath: string };

export type MarkCompleteResult =
  | { kind: "not-found" }
  | { kind: "completed"; allCompleted: boolean };

export type RetryResult =
  | { kind: "not-found" }
  | { kind: "already-pending" }
  | { kind: "already-completed" }
  | { kind: "retried" };

function loadState(
  gw: WorkspaceGateway,
  specName: string,
): SpecExecutionState | null {
  const statePath = PATHS.executionState(specName);
  if (gw.exists(statePath)) {
    return JSON.parse(
      gw.readFile(statePath),
    ) as SpecExecutionState;
  }
  return null;
}

function saveState(gw: WorkspaceGateway, state: SpecExecutionState) {
  const statePath = PATHS.executionState(state.specId);
  state.updatedAt = new Date().toISOString();
  gw.writeFile(statePath, JSON.stringify(state, null, 2));
}

function initExecutionState(
  gw: WorkspaceGateway,
  specName: string,
): SpecExecutionState {
  const state: SpecExecutionState = {
    specId: specName,
    status: "running",
    tasks: {},
    updatedAt: new Date().toISOString(),
  };

  const tasksDir = `${PATHS.tasksDir}/${specName}`;
  const files = gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const taskId = file.replace(".json", "");
    state.tasks[taskId] = { status: "pending" };
  }
  return state;
}

export function runExecution(
  gw: WorkspaceGateway,
  specName: string,
): RunResult {
  if (!gw.exists(PATHS.metadata)) {
    return { kind: "not-initialized" };
  }

  const tasksDir = `${PATHS.tasksDir}/${specName}`;
  if (!gw.exists(tasksDir)) {
    return { kind: "spec-not-found" };
  }

  if (!gw.exists(PATHS.executionsDir)) {
    gw.mkdir(PATHS.executionsDir);
  }

  let state = loadState(gw, specName);
  if (!state) {
    state = initExecutionState(gw, specName);
    saveState(gw, state);
  }

  // Check if everything is done
  const allTaskIds = Object.keys(state.tasks);
  const pendingTasks = allTaskIds.filter(
    (id) =>
      state!.tasks[id].status === "pending" ||
      state!.tasks[id].status === "failed",
  );

  if (pendingTasks.length === 0) {
    state.status = "completed";
    saveState(gw, state);
    return { kind: "finished" };
  }

  // Find a task whose dependencies are ALL completed
  let taskToRun: string | null = null;
  let taskDef: Task | null = null;

  for (const id of pendingTasks) {
    const taskPath = `${tasksDir}/${id}.json`;
    if (!gw.exists(taskPath)) continue;

    const parsed = JSON.parse(gw.readFile(taskPath)) as Task;
    const deps = parsed.dependencies || [];
    const allDepsCompleted = deps.every(
      (dep) => state!.tasks[dep] && state!.tasks[dep].status === "completed",
    );

    if (allDepsCompleted) {
      taskToRun = id;
      taskDef = parsed;
      break;
    }
  }

  if (!taskToRun || !taskDef) {
    // Deadlock or missing files
    return {
      kind: "error",
      message: "Cannot find any executable task. Check for circular dependencies or missing task files."
    };
  }

  // Build context
  const specExecDir = `${PATHS.executionsDir}/${specName}`;
  if (!gw.exists(specExecDir))
    gw.mkdir(specExecDir);

  const promptPath = `${specExecDir}/${taskToRun}.prompt.md`;
  const promptContent = buildContextPrompt(gw, specName, taskDef);
  gw.writeFile(promptPath, promptContent);

  state.tasks[taskToRun].status = "running";
  saveState(gw, state);

  return { kind: "task-ready", taskId: taskToRun, promptPath };
}

export function markTaskCompleted(
  gw: WorkspaceGateway,
  specName: string,
  taskId: string,
): MarkCompleteResult {
  const state = loadState(gw, specName);

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

  saveState(gw, state);
  return { kind: "completed", allCompleted };
}

export function retryTask(
  gw: WorkspaceGateway,
  specName: string,
  taskId: string,
): RetryResult {
  const state = loadState(gw, specName);

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
  saveState(gw, state);
  return { kind: "retried" };
}
