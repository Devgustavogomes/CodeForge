export interface SchedulerReporter {
  onStart(specName: string): void;
  onUpdate(specName: string): void;
  onComplete(specName: string): void;
  onFail(specName: string): void;
  onDeadlock(specName?: string): void;
  onError(error: string | Error): void;
}
