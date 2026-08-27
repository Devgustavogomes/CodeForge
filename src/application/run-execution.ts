import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { SpecExecutionState, TaskStatus } from "../domain/execution.js";
import { Task } from "../domain/task.js";
import { buildContextPrompt } from "./context-builder.js";
import yaml from "yaml";

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

function loadConfig(workspacePath: string): { agent_command: string } {
  const configPath = path.join(workspacePath, CODEFORGE_DIR, "config.yaml");
  if (!fs.existsSync(configPath)) {
    return { agent_command: "" };
  }
  const content = fs.readFileSync(configPath, "utf-8");
  try {
    const parsed = yaml.parse(content);
    return { agent_command: parsed?.agent_command || "" };
  } catch (e) {
    return { agent_command: "" };
  }
}

function loadState(executionsDir: string, specName: string): SpecExecutionState | null {
  const statePath = path.join(executionsDir, `${specName}.json`);
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, "utf-8")) as SpecExecutionState;
  }
  return null;
}

function saveState(executionsDir: string, state: SpecExecutionState) {
  const statePath = path.join(executionsDir, `${state.specId}.json`);
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

function initExecutionState(tasksDir: string, specName: string): SpecExecutionState {
  const state: SpecExecutionState = {
    specId: specName,
    status: "running",
    tasks: {},
    updatedAt: new Date().toISOString()
  };

  const files = fs.readdirSync(tasksDir).filter(f => f.endsWith(".json"));
  for (const file of files) {
    const taskId = file.replace(".json", "");
    state.tasks[taskId] = { status: "pending" };
  }
  return state;
}

export function runExecution(workspacePath: string, specName: string): RunResult {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);
  if (!fs.existsSync(path.join(codeforgeRoot, "metadata.json"))) {
    return { notInitialized: true, specNotFound: false, tasksCompleted: 0, finished: false };
  }

  const tasksDir = path.join(codeforgeRoot, "tasks", specName);
  if (!fs.existsSync(tasksDir)) {
    return { notInitialized: false, specNotFound: true, tasksCompleted: 0, finished: false };
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

  const config = loadConfig(workspacePath);
  let tasksCompletedInThisRun = 0;

  while (true) {
    // Check if everything is done
    const allTaskIds = Object.keys(state.tasks);
    const pendingTasks = allTaskIds.filter(id => state!.tasks[id].status === "pending" || state!.tasks[id].status === "failed");
    
    if (pendingTasks.length === 0) {
      state.status = "completed";
      saveState(executionsDir, state);
      return { notInitialized: false, specNotFound: false, tasksCompleted: tasksCompletedInThisRun, finished: true };
    }

    // Find a task whose dependencies are ALL completed
    let taskToRun: string | null = null;
    let taskDef: Task | null = null;

    for (const id of pendingTasks) {
      const taskPath = path.join(tasksDir, `${id}.json`);
      if (!fs.existsSync(taskPath)) continue;
      
      const parsed = JSON.parse(fs.readFileSync(taskPath, "utf-8")) as Task;
      const deps = parsed.dependencies || [];
      const allDepsCompleted = deps.every(dep => state!.tasks[dep] && state!.tasks[dep].status === "completed");

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
        tasksCompleted: tasksCompletedInThisRun, 
        error: "Cannot find any executable task. Check for circular dependencies or missing task files.", 
        finished: false 
      };
    }

    // Build context
    const specExecDir = path.join(executionsDir, specName);
    if (!fs.existsSync(specExecDir)) fs.mkdirSync(specExecDir, { recursive: true });

    const promptPath = path.join(specExecDir, `${taskToRun}.prompt.md`);
    const promptContent = buildContextPrompt(workspacePath, specName, taskDef);
    fs.writeFileSync(promptPath, promptContent, "utf-8");

    state.tasks[taskToRun].status = "running";
    saveState(executionsDir, state);

    if (!config.agent_command) {
      // Manual fallback
      return {
        notInitialized: false,
        specNotFound: false,
        tasksCompleted: tasksCompletedInThisRun,
        manualTaskRequired: taskToRun,
        manualPromptPath: promptPath,
        finished: false
      };
    }

    // Autonomous run
    const cmd = config.agent_command.replace("{prompt_file}", promptPath);
    console.log(`\n▶ Executing ${taskToRun} via AI Agent...`);
    console.log(`$ ${cmd}\n`);

    try {
      execSync(cmd, { stdio: "inherit", cwd: workspacePath });
      state.tasks[taskToRun].status = "completed";
      saveState(executionsDir, state);
      tasksCompletedInThisRun++;
      console.log(`\n✓ ${taskToRun} completed successfully.\n`);
    } catch (e: any) {
      state.tasks[taskToRun].status = "failed";
      saveState(executionsDir, state);
      return {
        notInitialized: false,
        specNotFound: false,
        tasksCompleted: tasksCompletedInThisRun,
        error: `Agent execution failed for ${taskToRun} with exit code ${e.status}.`,
        finished: false
      };
    }
  }
}

export function markTaskCompleted(workspacePath: string, specName: string, taskId: string): boolean {
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
