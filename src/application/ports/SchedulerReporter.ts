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
  onStart(intentName: string): void;
  onUpdate(intentName: string): void;
  onComplete(intentName: string): void;
  onFail(intentName: string): void;
  onDeadlock(intentName?: string): void;
  onError(error: string | Error): void;
  onLog?(taskId: string, chunk: string): void;
  /** Optional so reporters that do not present AI review remain compatible. */
  onReviewStart?(intentName: string, metadata: ReviewStartMetadata): void;
  onReviewEnd?(intentName: string, result: ReviewResultMetadata): void;
  onReviewError?(intentName: string, error: ReviewErrorMetadata): void;
}
