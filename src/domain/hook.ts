export const HOOK_EVENTS = [
  "run.started",
  "run.completed",
  "run.failed",
  "run.deadlock",
  "task.started",
  "task.verify",
  "task.completed",
  "task.failed",
  "review.started",
  "review.completed",
] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

/**
 * A `notify` hook observes: its exit code is reported but never changes the
 * outcome of a task. A `gate` hook can veto, so a non-zero exit turns the task
 * into a failure that carries the hook output as its diagnostics.
 */
export type HookType = "notify" | "gate";

export interface HookDefinition {
  name: string;
  run: string;
  type?: HookType;
  timeout?: number;
}

export type HookMap = Partial<Record<HookEvent, HookDefinition[]>>;

export type ReviewOutcome = "approved" | "tasks_created";

export interface ReviewResultMetadata {
  outcome: ReviewOutcome;
  newTasksCount: number;
  taskIds: string[];
}

export interface HookContext {
  event: HookEvent;
  intentName: string;
  taskId?: string;
  errors?: string[];
  /** Present for review.completed hooks. */
  reviewResult?: ReviewResultMetadata;
}

export interface HookResult {
  name: string;
  type: HookType;
  ok: boolean;
  exitCode: number | null;
  output: string;
}
