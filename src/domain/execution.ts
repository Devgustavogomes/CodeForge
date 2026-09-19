export type TaskStatus = "pending" | "running" | "completed" | "failed";

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
  status: TaskStatus;
  startedAt?: string;
  completedAt?: string;
  tasks: Record<string, TaskExecutionState>;
  updatedAt: string;
}