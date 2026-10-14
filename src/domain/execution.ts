import type { ProcessRecord } from "../infrastructure/process/ProcessExecutor.js";

export type TaskStatus = "pending" | "running" | "completed" | "failed";

/** Completion is approval only; integration and delivery have their own records. */
export type IntentExecutionStatus = TaskStatus | "reviewing" | "paused";
export type ExecutionStage = "preparation" | "execution" | "verification" | "commit" | "integration";
export type StageStatus = "pending" | "running" | "succeeded" | "failed" | "blocked";

export interface ProcessOwnership {
  pid: number;
  host: string;
  /** Distinguishes a reused PID from the process that acquired ownership. */
  token: string;
  startedAt: string;
  worktreePath?: string;
  childPids?: number[];
}

export interface ExecutionDiagnostic {
  stage: ExecutionStage | "delivery" | "cleanup" | "recovery";
  message: string;
  recordedAt: string;
  attempt?: number;
  operationId?: string;
}

export interface StageRecord {
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  operationId?: string;
}

export interface GitIdentity {
  repositoryPath: string;
  branch: string;
  worktreePath: string;
  /** null records an observed absent ref/worktree, not an unknown commit. */
  headCommit: string | null;
  treeCommit?: string;
  exists?: boolean;
}

/** Persist intent before invoking Git; persist observed outcome only after inspecting Git. */
export interface ExecutionOperation {
  id: string;
  runId: string;
  taskId?: string;
  attempt: number;
  kind: "commit" | "integration" | "delivery" | "cleanup" | "worktree";
  status: "intended" | "succeeded" | "failed";
  intendedAt: string;
  owner?: ProcessOwnership;
  before: GitIdentity;
  /** Source identifies the result being integrated/delivered or artifact being removed. */
  source?: GitIdentity;
  expectedAfter: GitIdentity;
  outcome?: {
    recordedAt: string;
    after: GitIdentity;
    diagnostics?: string[];
  };
}

export interface ConflictResolutionRecord {
  id: string;
  incomingCommit: string;
  lastAcceptedCommit: string;
  worktreePath: string;
  attempts: number;
  status: "pending" | "running" | "failed" | "succeeded" | "exhausted";
  conflicts: string[];
  diagnostics: string[];
  promptPaths?: string[];
  resolvedCommit?: string;
}

export interface IntegrationRecord extends StageRecord {
  resolution?: ConflictResolutionRecord;
  acceptedCommit?: string;
  resultCommit?: string;
}

export interface DeliveryRecord extends StageRecord {
  originalCommit?: string;
  resultCommit?: string;
  deliveredCommit?: string;
}

export interface CleanupRecord extends StageRecord {
  branch: string;
  worktreePath: string;
  preservedCommit?: string;
}

export interface TaskExecutionState {
  status: TaskStatus;
  dependencies: string[];
  title?: string;
  startedAt?: string;
  completedAt?: string;
  errors?: string[];
  branch?: string;
  worktreePath?: string;
  baseCommit?: string;
  resultCommit?: string;
  attempt?: number;
  stage?: ExecutionStage;
  stages?: Partial<Record<ExecutionStage, StageRecord>>;
  integration?: IntegrationRecord;
  diagnostics?: ExecutionDiagnostic[];
  owner?: ProcessOwnership;
  cleanup?: CleanupRecord;
}

export interface IntentExecutionState {
  intentId: string;
  status: IntentExecutionStatus;
  schemaVersion?: 2;
  revision?: number;
  runId?: string;
  repositoryPath?: string;
  originalBranch?: string;
  originalCommit?: string;
  originalWorktreePath?: string;
  integrationBranch?: string;
  integrationWorktreePath?: string;
  lastAcceptedCommit?: string;
  owner?: ProcessOwnership;
  integrationOwner?: ProcessOwnership;
  /** FIFO of approved results awaiting serialized integration. */
  integrationQueue?: string[];
  recovery?: "legacy-evidence-required";
  operations?: ExecutionOperation[];
  /** Append-only process launch history, retained after task removal and termination. */
  processes?: ProcessRecord[];
  diagnostics?: ExecutionDiagnostic[];
  delivery?: DeliveryRecord;
  cleanup?: CleanupRecord[];
  /** Removed task records remain recoverable even after their task file is deleted. */
  archivedTasks?: Record<string, TaskExecutionState[]>;
  startedAt?: string;
  completedAt?: string;
  tasks: Record<string, TaskExecutionState>;
  reviewRounds?: number;
  reviewError?: string;
  reviewApproved?: boolean;
  updatedAt: string;
}

export function isTaskIntegrated(state: IntentExecutionState, taskId: string): boolean {
  const task = state.tasks[taskId];
  return state.recovery === undefined && !!state.runId && !!state.repositoryPath &&
    !!state.integrationBranch && !!state.integrationWorktreePath &&
    !!task && task.status === "completed" && !!task.branch && !!task.worktreePath &&
    !!task.baseCommit && !!task.resultCommit &&
    task.integration?.status === "succeeded" && !!task.integration.acceptedCommit &&
    task.integration.resultCommit === task.resultCommit;
}
