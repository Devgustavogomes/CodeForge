export type ExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked";

export interface Execution {
  id: string;

  taskId: string;

  status: ExecutionStatus;

  attempt: number;

  startedAt?: Date;
  finishedAt?: Date;

  error?: string;
}
