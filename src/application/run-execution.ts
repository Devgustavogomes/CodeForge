import fs from "node:fs";
import path from "node:path";
import { SpecExecutionState } from "../domain/execution.js";
import { Task } from "../domain/task.js";
import { buildContextPrompt } from "./context-builder.js";

const CODEFORGE_DIR = ".codeforge";

export interface RunResult {
  notInitialized: boolean;
  specNotFound: boolean;
  tasksCompleted: number;
  manualTaskRequired?: string;
  manualPromptPath?: string;
  error?: string;
  finished: boolean;
}

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
    return {
      notInitialized: true,
      specNotFound: false,
      tasksCompleted: 0,
      finished: false,
    };
  }

  const tasksDir = path.join(codeforgeRoot, "tasks", specName);
  if (!fs.existsSync(tasksDir)) {
    return {
      notInitialized: false,
      specNotFound: true,
      tasksCompleted: 0,
      finished: false,
    };
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
    return {
      notInitialized: false,
      specNotFound: false,
      tasksCompleted: 0,
      finished: true,
    };
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
      notInitialized: false,
      specNotFound: false,
      tasksCompleted: 0,
      error:
        "Cannot find any executable task. Check for circular dependencies or missing task files.",
      finished: false,
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

  return {
    notInitialized: false,
    specNotFound: false,
    tasksCompleted: 0,
    manualTaskRequired: taskToRun,
    manualPromptPath: promptPath,
    finished: false,
  };
}

export function markTaskCompleted(
  workspacePath: string,
  specName: string,
  taskId: string,
): boolean {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);
  const executionsDir = path.join(codeforgeRoot, "executions");
  const state = loadState(executionsDir, specName);

  if (!state || !state.tasks[taskId]) {
    return false;
  }

  state.tasks[taskId].status = "completed";
  saveState(executionsDir, state);
  return true;
}

export function retryTask(
  workspacePath: string,
  specName: string,
  taskId: string,
): { success: boolean; reason?: string } {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);
  const executionsDir = path.join(codeforgeRoot, "executions");
  const state = loadState(executionsDir, specName);

  if (!state || !state.tasks[taskId]) {
    return { success: false, reason: "Task or spec execution not found." };
  }

  const currentStatus = state.tasks[taskId].status;

  if (currentStatus === "pending") {
    return { success: false, reason: "Task is already pending." };
  }

  if (currentStatus === "completed") {
    return { success: false, reason: "Task is already completed. Use 'task reset' if you want to redo it." };
  }

  state.tasks[taskId].status = "pending";
  saveState(executionsDir, state);
  return { success: true };
}
