import { isRunDelivered, IntentStatusResult, TaskStatusInfo } from "../../application/use-cases/GetIntentStatusUseCase.js";
import { SupportedLanguage } from "../../config/types.js";
import { IntentExecutionState, TaskStatus } from "../../domain/execution.js";
import { translate, TranslationKey } from "./i18n.js";

export type { TaskStatusInfo };
export type IntentStatusSnapshot = Extract<IntentStatusResult, { kind: "status" }>;
export type StatusSnapshot = IntentStatusSnapshot;

export interface StatusFormatterOptions {
  /** Enables ANSI styling. When omitted, terminal color support is detected. */
  color?: boolean;
  language?: SupportedLanguage;
  /** When provided, renders elapsed time header instead of status header. */
  elapsed?: string;
  /** Current time for running task durations. */
  snapshotAt?: string;
  /** When true, includes a visual progress bar. */
  progressBar?: boolean;
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
} as const;

const STATUS_ICON: Record<TaskStatus, string> = {
  completed: "✓",
  running: "▶",
  failed: "✗",
  pending: "○",
};

const STATUS_TRANSLATION: Record<TaskStatus, TranslationKey> = {
  completed: "terminal_status_completed",
  running: "terminal_status_running",
  failed: "terminal_status_failed",
  pending: "terminal_status_pending",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  completed: ANSI.green,
  running: ANSI.cyan,
  failed: ANSI.red,
  pending: ANSI.gray,
};

export function supportsColor(): boolean {
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  if (process.env.FORCE_COLOR !== undefined) {
    return process.env.FORCE_COLOR !== "0";
  }

  return Boolean(process.stdout.isTTY) && process.env.TERM !== "dumb";
}

function style(text: string, ansi: string, color: boolean): string {
  return color ? `${ansi}${text}${ANSI.reset}` : text;
}

function parseTimestamp(timestamp?: string): number | undefined {
  if (!timestamp) {
    return undefined;
  }

  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : undefined;
}

export function formatElapsed(milliseconds: number): string {
  const elapsed = Math.max(0, Math.floor(milliseconds));
  if (elapsed < 1000) {
    return `${elapsed}ms`;
  }

  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function taskDuration(task: TaskStatusInfo, snapshotAt: string): string {
  const startedAt = parseTimestamp(task.startedAt);
  const completedAt = parseTimestamp(task.completedAt ?? snapshotAt);

  if (startedAt === undefined || completedAt === undefined || completedAt < startedAt) {
    return "-";
  }

  return formatElapsed(completedAt - startedAt);
}

function statusLabel(status: TaskStatus, language: SupportedLanguage): string {
  return translate(STATUS_TRANSLATION[status] ?? "terminal_status_pending", language);
}

function formatTaskRow(
  task: TaskStatusInfo,
  snapshotAt: string,
  language: SupportedLanguage,
  color: boolean,
): string[] {
  const statusKey = (task.status in STATUS_ICON ? task.status : "pending") as TaskStatus;
  const translatedStatus = statusKey === "completed" ? translate("execution_approved", language) : statusLabel(statusKey, language);
  const marker = style(`[${STATUS_ICON[statusKey] ?? "○"}]`, STATUS_COLOR[statusKey] ?? ANSI.gray, color);
  const status = style(`(${translatedStatus})`, STATUS_COLOR[statusKey] ?? ANSI.gray, color);
  const duration = translate("terminal_status_duration", language, {
    duration: taskDuration(task, snapshotAt),
  });
  const lines = [`  ${marker} ${task.id}: ${task.title} ${status} [${duration}]`];

  for (const dependency of task.dependencies ?? []) {
    lines.push(`      [${translate("terminal_status_dependencies", language, {
      dependencies: dependency,
    })}]`);
  }

  if (task.status === "failed") {
    for (const error of task.errors ?? []) {
      const message = translate("terminal_status_error", language, { error });
      lines.push(`      ${style(message, ANSI.red, color)}`);
    }
  }

  lines.push(...formatTaskOutcomes(task, language).map(line => `      ${line}`));
  return lines;
}

export function renderProgressBar(
  completed: number,
  total: number,
  barWidth: number = 20,
): string {
  if (total <= 0) {
    return `[${"░".repeat(barWidth)}]`;
  }

  const fraction = Math.min(1, Math.max(0, completed / total));
  const filled = Math.round(fraction * barWidth);
  const empty = barWidth - filled;

  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

function formatStatus(
  result: StatusSnapshot,
  language: SupportedLanguage,
  color: boolean,
  options: StatusFormatterOptions = {},
): string {
  const counts: Record<TaskStatus, number> = {
    completed: 0,
    running: 0,
    failed: 0,
    pending: 0,
  };

  for (const task of result.tasks) {
    const s = task.status as TaskStatus;
    if (s in counts) {
      counts[s] += 1;
    } else {
      counts.pending += 1;
    }
  }

  const total = result.tasks.length;
  const percent = total === 0 ? 0 : Math.round((counts.completed / total) * 100);
  const intentName = result.intentName ?? "";
  const rawStatus = (result.intentStatus ?? "pending") as TaskStatus;
  const translatedStatus = rawStatus === "completed"
    ? translate(result.delivered ? "execution_delivered" : "execution_pending_delivery", language)
    : STATUS_TRANSLATION[rawStatus]
    ? statusLabel(rawStatus, language)
    : String(rawStatus);

  const header = options.elapsed !== undefined
    ? translate("terminal_run_header", language, {
        intent: intentName,        elapsed: options.elapsed,
      })
    : translate("terminal_status_header", language, {
        intent: intentName,        status: translatedStatus,
      });

  const progress = translate("terminal_status_progress", language, {
    completed: counts.completed,
    total,
    percent,
  });
  const progressBar = options.progressBar
    ? ` ${renderProgressBar(counts.completed, total)}`
    : "";
  const summary = translate("terminal_status_summary", language, {
    completed: counts.completed,
    running: counts.running,
    failed: counts.failed,
    pending: counts.pending,
  });

  const lines = [
    style(header, STATUS_COLOR[rawStatus] ?? ANSI.bold, color),
    style(`${progress}${progressBar}`, ANSI.cyan, color),
    summary,
    translate("execution_integrated_count", language, { accepted: result.tasks.filter(task => task.integrated).length, total, blocked: result.tasks.filter(task => task.integration?.status === "blocked" || task.integration?.status === "failed").length }),
    "",
    style(translate("terminal_status_tasks", language), ANSI.bold, color),
  ];

  for (const task of result.tasks) {
    lines.push(...formatTaskRow(task, options.snapshotAt ?? result.updatedAt, language, color));
  }

  if (result.execution) lines.push("", ...formatExecutionOutcomes(result.execution, language));
  return lines.join("\n");
}

/** Produces stable, ANSI-free status output for redirected streams and tests. */
export function formatPlainTextStatus(
  result: StatusSnapshot,
  language: SupportedLanguage = "en",
): string {
  return formatStatus(result, language, false);
}

/** Formats one terminal snapshot without starting or depending on the TUI. */
export function formatStatusOutput(
  result: StatusSnapshot,
  options: StatusFormatterOptions | boolean = {},
): string {
  const normalized = typeof options === "boolean" ? { color: options } : options;
  return formatStatus(
    result,
    normalized.language ?? "en",
    normalized.color ?? supportsColor(),
    normalized,
  );
}

/** Formats a terminal scheduler snapshot with elapsed time header and progress bar. */
export function formatSchedulerSnapshot(
  result: StatusSnapshot,
  options: StatusFormatterOptions = {},
): string {
  return formatStatus(
    result,
    options.language ?? "en",
    options.color ?? supportsColor(),
    {
      ...options,
      progressBar: options.progressBar ?? true,
    },
  );
}

export function formatTaskOutcomes(task: TaskStatusInfo, language: SupportedLanguage = "en"): string[] {
  const lines: string[] = [];
  if (task.resultCommit || task.status === "completed") lines.push(translate("execution_approval", language, {
    status: task.resultCommit ? "approved" : "commit evidence missing", commit: task.resultCommit ?? "-",
  }));
  if (task.integration || task.status === "completed") lines.push(translate("execution_integration", language, {
    status: task.integrated ? "accepted" : task.integration?.status === "succeeded" ? "acceptance evidence missing" : task.integration?.status ?? "pending",
    commit: task.integration?.acceptedCommit ?? "-",
  }));
  if (task.branch || task.worktreePath) lines.push(translate("execution_artifact", language, { branch: task.branch ?? "-", path: task.worktreePath ?? "-" }));
  if (task.stage) lines.push(translate("execution_diagnostic", language, { stage: task.stage, message: task.stages?.[task.stage]?.status ?? task.status, operation: task.stages?.[task.stage]?.operationId ?? "" }));
  if (task.owner) lines.push(translate("execution_owner", language, { pid: task.owner.pid, host: task.owner.host, path: task.owner.worktreePath ?? task.worktreePath ?? "-" }));
  for (const diagnostic of task.diagnostics ?? []) lines.push(translate("execution_diagnostic", language, { stage: diagnostic.stage, message: diagnostic.message, operation: diagnostic.operationId ?? "" }));
  const resolution = task.integration?.resolution;
  if (resolution) {
    lines.push(translate("execution_diagnostic", language, { stage: "integration", message: "Conflict resolution " + resolution.status + "; attempts " + resolution.attempts + "/2; conflicts: " + resolution.conflicts.join(", ") + "; inspect " + resolution.worktreePath, operation: resolution.id }));
    lines.push(...resolution.diagnostics);
  }
  if (task.cleanup) lines.push(translate("execution_cleanup", language, { status: task.cleanup.status, path: task.cleanup.worktreePath }));
  return lines;
}

export function formatExecutionOutcomes(state: IntentExecutionState, language: SupportedLanguage = "en"): string[] {
  const lines = [translate("execution_delivery", language, { status: isRunDelivered(state) ? "delivered" : state.delivery?.status === "succeeded" ? "delivery evidence incomplete" : state.delivery?.status ?? "pending", commit: state.delivery?.deliveredCommit ?? state.lastAcceptedCommit ?? "-" })];
  if (state.integrationBranch || state.integrationWorktreePath) lines.push(translate("execution_artifact", language, { branch: state.integrationBranch ?? "-", path: state.integrationWorktreePath ?? "-" }));
  for (const owner of [state.owner, state.integrationOwner]) if (owner) lines.push(translate("execution_owner", language, { pid: owner.pid, host: owner.host, path: owner.worktreePath ?? state.integrationWorktreePath ?? "-" }));
  for (const record of state.processes ?? []) if (["running", "launching", "interrupted", "unknown"].includes(record.status)) {
    lines.push(translate("execution_diagnostic", language, { stage: "recovery", message: "Process " + record.status + " (PID " + (record.pid ?? "unrecorded") + " on " + record.host + "; " + record.command + ") in " + record.cwd + "; inspect ownership before resuming. " + record.diagnostics.join(" "), operation: record.id }));
  }
  if (state.recovery) lines.push(translate("execution_diagnostic", language, { stage: "recovery", message: "Legacy execution requires recorded Git ownership evidence before resuming.", operation: "" }));
  for (const diagnostic of state.diagnostics ?? []) lines.push(translate("execution_diagnostic", language, { stage: diagnostic.stage, message: diagnostic.message, operation: diagnostic.operationId ?? "" }));
  for (const op of state.operations ?? []) if (op.status !== "succeeded") lines.push(translate("execution_diagnostic", language, { stage: op.kind, message: op.status + "; inspect " + op.before.branch + " at " + op.before.worktreePath + ". " + (op.outcome?.diagnostics?.join(" ") ?? ""), operation: op.id }));
  for (const cleanup of state.cleanup ?? []) lines.push(translate("execution_cleanup", language, { status: cleanup.status, path: cleanup.worktreePath }));
  return lines;
}
