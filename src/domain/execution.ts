export type TaskStatus = "pending" | "running" | "completed" | "failed";

/** Status of an entire intent run. This deliberately differs from TaskStatus. */
export type IntentExecutionStatus = TaskStatus | "reviewing" | "paused";

export interface TaskExecutionState {
  status: TaskStatus;
  dependencies: string[];
  title?: string;
  startedAt?: string;
  completedAt?: string;
  errors?: string[];
}

export interface IntentExecutionState {
  intentId: string;
  status: IntentExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  tasks: Record<string, TaskExecutionState>;
  /** Number of AI review cycles that created follow-up tasks. */
  reviewRounds?: number;
  /** Recoverable failure from the most recent AI review attempt. */
  reviewError?: string;
  /** True once review approval (or an explicit bypass) has made the run terminal. */
  reviewApproved?: boolean;
  updatedAt: string;
}
