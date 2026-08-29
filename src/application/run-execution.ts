import fs from "node:fs";
import path from "node:path";
import { SpecExecutionState } from "../domain/execution.js";
import { Task } from "../domain/task.js";
import { buildContextPrompt } from "./context-builder.js";

const CODEFORGE_DIR = ".codeforge";

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
  executionsDir: string,
  specName: string,
): SpecExecutionState | null {
  const statePath = path.join(executionsDir, `${specName}.json`);
  if (fs.existsSync(statePath)) {
    return JSON.parse(
      fs.readFileSync(statePath, "utf-8"),
    ) as SpecExecutionState;
  }
  return null;
}

function saveState(executionsDir: string, state: SpecExecutionState) {
  const statePath = path.join(executionsDir, `${state.specId}.json`);
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

function initExecutionState(
  tasksDir: string,
  specName: string,
): SpecExecutionState {
  const state: SpecExecutionState = {
    specId: specName,
    status: "running",
    tasks: {},
    updatedAt: new Date().toISOString(),
  };

  const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const taskId = file.replace(".json", "");
    state.tasks[taskId] = { status: "pending" };
  }
  return state;
}

export function runExecution(
  workspacePath: string,
  specName: string,
): RunResult {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);
  if (!fs.existsSync(path.join(codeforgeRoot, "metadata.json"))) {
    return { kind: "not-initialized" };
  }

  const tasksDir = path.join(codeforgeRoot, "tasks", specName);
  if (!fs.existsSync(tasksDir)) {
    return { kind: "spec-not-found" };
  }

  const executionsDir = path.join(codeforgeRoot, "executions");
  if (!fs.existsSync(executionsDir)) {
    fs.mkdirSync(executionsDir, { recursive: true });
  }

  let state = loadState(executionsDir, specName);
  if (!state) {
    state = initExecutionState(tasksDir, specName);
    saveState(executionsDir, state);
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
    saveState(executionsDir, state);
    return { kind: "finished" };
  }

  // Find a task whose dependencies are ALL completed
  let taskToRun: string | null = null;
  let taskDef: Task | null = null;

  for (const id of pendingTasks) {
    const taskPath = path.join(tasksDir, `${id}.json`);
    if (!fs.existsSync(taskPath)) continue;

    const parsed = JSON.parse(fs.readFileSync(taskPath, "utf-8")) as Task;
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
  const specExecDir = path.join(executionsDir, specName);
  if (!fs.existsSync(specExecDir))
    fs.mkdirSync(specExecDir, { recursive: true });

  const promptPath = path.join(specExecDir, `${taskToRun}.prompt.md`);
  const promptContent = buildContextPrompt(workspacePath, specName, taskDef);
  fs.writeFileSync(promptPath, promptContent, "utf-8");

  state.tasks[taskToRun].status = "running";
  saveState(executionsDir, state);

  return { kind: "task-ready", taskId: taskToRun, promptPath };
}

export function markTaskCompleted(
  workspacePath: string,
  specName: string,
  taskId: string,
): MarkCompleteResult {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);
  const executionsDir = path.join(codeforgeRoot, "executions");
  const state = loadState(executionsDir, specName);

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

  saveState(executionsDir, state);
  return { kind: "completed", allCompleted };
}

export function retryTask(
  workspacePath: string,
  specName: string,
  taskId: string,
): RetryResult {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);
  const executionsDir = path.join(codeforgeRoot, "executions");
  const state = loadState(executionsDir, specName);

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
  saveState(executionsDir, state);
  return { kind: "retried" };
}
