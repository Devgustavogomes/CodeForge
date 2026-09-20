import {
  HookContext,
  HookDefinition,
  HookEvent,
  HookResult,
} from "../../domain/hook.js";

export interface ActiveHookInfo {
  event: HookEvent;
  definition: HookDefinition;
  context: HookContext;
  startedAt: number;
}

export interface CompletedHookInfo {
  event: HookEvent;
  definition: HookDefinition;
  context: HookContext;
  result: HookResult;
  durationMs: number;
}

/**
 * Port for observing hook lifecycle events during execution.
 */
export interface HookReporter {
  onHookStart(info: ActiveHookInfo): void;
  onHookEnd(info: CompletedHookInfo): void;
}
