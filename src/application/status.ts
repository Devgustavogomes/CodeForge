import { SpecExecutionState, TaskStatus } from "../domain/execution.js";
import { Task } from "../domain/task.js";
import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { PATHS } from "../infrastructure/paths.js";

export interface TaskStatusInfo {
  id: string;
  title: string;
  status: TaskStatus;
  dependencies: string[];
  startedAt?: string;
  completedAt?: string;
}

export type StatusResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "no-execution"; specName: string }
  | { kind: "status"; specName: string; specStatus: string; tasks: TaskStatusInfo[]; updatedAt: string; startedAt?: string; completedAt?: string };

export function getSpecStatus(
  gw: WorkspaceGateway,
  specName: string,
): StatusResult {
  if (!gw.exists(PATHS.metadata)) {
    return { kind: "not-initialized" };
  }

  const tasksDir = `${PATHS.tasksDir}/${specName}`;
  if (!gw.exists(tasksDir)) {
    return { kind: "spec-not-found" };
  }

  const statePath = PATHS.executionState(specName);
  if (!gw.exists(statePath)) {
    return { kind: "no-execution", specName };
  }

  const state = JSON.parse(
    gw.readFile(statePath),
  ) as SpecExecutionState;

  const tasks: TaskStatusInfo[] = [];

  const taskFiles = gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
  for (const file of taskFiles) {
    const taskId = file.replace(".json", "");
    const taskPath = `${tasksDir}/${file}`;
    const taskDef = JSON.parse(gw.readFile(taskPath)) as Task;

    const taskState = state.tasks[taskId];
    tasks.push({
      id: taskId,
      title: taskDef.title,
      status: taskState?.status ?? "pending",
      dependencies: taskDef.dependencies || [],
      startedAt: taskState?.startedAt,
      completedAt: taskState?.completedAt,
    });
  }

  // Sort by task ID for consistent ordering
  tasks.sort((a, b) => a.id.localeCompare(b.id));

  return {
    kind: "status",
    specName,
    specStatus: state.status,
    tasks,
    updatedAt: state.updatedAt,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
  };
}

const STATUS_ICONS: Record<TaskStatus, string> = {
  completed: "✓",
  running: "▶",
  pending: "○",
  failed: "✗",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  completed: "\x1b[32m", // green
  running: "\x1b[36m",   // cyan
  pending: "\x1b[90m",   // gray
  failed: "\x1b[31m",    // red
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

export function formatTimeDiff(start?: string, end?: string): string {
  if (!start) return "";
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const elapsed = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const secs = (elapsed % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export function formatStatusOutput(result: Extract<StatusResult, { kind: "status" }>): string {
  const lines: string[] = [];

  const total = result.tasks.length;
  const completed = result.tasks.filter((t) => t.status === "completed").length;
  const running = result.tasks.filter((t) => t.status === "running").length;
  const failed = result.tasks.filter((t) => t.status === "failed").length;
  const pending = result.tasks.filter((t) => t.status === "pending").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Header
  lines.push("");
  lines.push(`${BOLD}  Spec: ${result.specName}${RESET}`);
  if (result.startedAt) {
    const totalTime = formatTimeDiff(result.startedAt, result.completedAt);
    lines.push(`${DIM}  Time elapsed: ${totalTime}${RESET}`);
  }
  lines.push("");

  // Progress bar
  const barWidth = 30;
  const filledCount = total > 0 ? Math.round((completed / total) * barWidth) : 0;
  const bar = "█".repeat(filledCount) + "░".repeat(barWidth - filledCount);
  lines.push(`  ${STATUS_COLORS.completed}${bar}${RESET} ${percent}% (${completed}/${total})`);
  lines.push("");

  // Summary counts
  const parts: string[] = [];
  if (completed > 0) parts.push(`${STATUS_COLORS.completed}${STATUS_ICONS.completed} ${completed} completed${RESET}`);
  if (running > 0) parts.push(`${STATUS_COLORS.running}${STATUS_ICONS.running} ${running} running in parallel${RESET}`);
  if (failed > 0) parts.push(`${STATUS_COLORS.failed}${STATUS_ICONS.failed} ${failed} failed${RESET}`);
  if (pending > 0) parts.push(`${STATUS_COLORS.pending}${STATUS_ICONS.pending} ${pending} pending${RESET}`);
  lines.push(`  ${parts.join("  ")}`);
  lines.push("");

  // Task list with dependency graph
  lines.push(`${DIM}  ─────────────────────────────────────────${RESET}`);

  for (const task of result.tasks) {
    const icon = STATUS_ICONS[task.status];
    const color = STATUS_COLORS[task.status];

    let depInfo = "";
    if (task.dependencies.length > 0) {
      depInfo = ` ${DIM}← ${task.dependencies.join(", ")}${RESET}`;
    }

    let timeStr = "";
    if (task.startedAt) {
      timeStr = ` ${DIM}[${formatTimeDiff(task.startedAt, task.completedAt)}]${RESET}`;
    }

    lines.push(`  ${color}${icon}${RESET} ${BOLD}${task.id}${RESET} ${task.title}${depInfo}${timeStr}`);
  }

  lines.push(`${DIM}  ─────────────────────────────────────────${RESET}`);
  lines.push("");

  return lines.join("\n");
}
