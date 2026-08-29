export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface SpecExecutionState {
  specId: string;
  status: TaskStatus;
  tasks: Record<string, { status: TaskStatus }>;
  updatedAt: string;
}
