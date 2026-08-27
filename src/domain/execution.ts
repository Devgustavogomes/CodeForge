export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface SpecExecutionState {
  specId: string;
  status: "running" | "completed" | "failed";
  tasks: Record<string, { status: TaskStatus }>;
  updatedAt: string;
}
