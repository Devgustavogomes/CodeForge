export interface SchedulerReporter {
  onStart(intentName: string): void;
  onUpdate(intentName: string): void;
  onComplete(intentName: string): void;
  onFail(intentName: string): void;
  onDeadlock(intentName?: string): void;
  onError(error: string | Error): void;
  onLog?(taskId: string, chunk: string): void;
}
