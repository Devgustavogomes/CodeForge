export interface SchedulerReporter {
  onStart(specName: string): void;
  onUpdate(specName: string): void;
  onComplete(specName: string): void;
  onDeadlock(): void;
  onError(error: string | Error): void;
}
