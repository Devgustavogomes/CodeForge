export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface SpecExecutionState {
  specId: string;
  status: TaskStatus;
  startedAt?: string;
  completedAt?: string;
  tasks: Record<string, { status: TaskStatus; dependencies: string[]; title?: string; startedAt?: string; completedAt?: string; }>;
  updatedAt: string;
}
