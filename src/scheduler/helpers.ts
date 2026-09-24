import { SchedulerRunResult } from "./types.js";
import { HookContext, HookEvent } from "../domain/hook.js";

export function createResult(
  status: SchedulerRunResult["status"],
  intentName: string,
  reason?: string,
  newTasks?: string[],
): SchedulerRunResult {
  if (status === "pending") {
    return { status, intentName, newTasks: newTasks ?? [] };
  }
  if (status === "paused" || status === "failed") {
    return { status, intentName, reason };
  }
  return { status, intentName };
}

export function createHookContext(
  event: HookEvent,
  intentName: string,
  taskId?: string,
  errors?: string[],
): HookContext {
  return {
    event,
    intentName,
    ...(taskId ? { taskId } : {}),
    ...(errors ? { errors } : {}),
  };
}
