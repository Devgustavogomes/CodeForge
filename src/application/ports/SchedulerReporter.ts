import type { IntentExecutionState } from "../../domain/execution.js";
import type { ReviewResultMetadata } from "../../domain/hook.js";

export interface ReviewStartMetadata {
  agent: string;
  round: number;
  maxRounds: number;
}

export interface ReviewErrorMetadata {
  message: string;
  round: number;
}

export interface SchedulerReporter {
  /** Persisted stage outcomes, including retained artifacts and diagnostics. */
  onOutcome?(intentName: string, state: IntentExecutionState): void;
  onWarning?(message: string): void;
  onStart(intentName: string): void;
  onUpdate(intentName: string): void;
  onComplete(intentName: string, state?: IntentExecutionState): void;
  onFail(intentName: string): void;
  onDeadlock(intentName?: string): void;
  onError(error: string | Error): void;
  onLog?(taskId: string, chunk: string): void;
  /** Optional so reporters that do not present AI review remain compatible. */
  onReviewStart?(intentName: string, metadata: ReviewStartMetadata): void;
  onReviewEnd?(intentName: string, result: ReviewResultMetadata): void;
  onReviewError?(intentName: string, error: ReviewErrorMetadata): void;
}
