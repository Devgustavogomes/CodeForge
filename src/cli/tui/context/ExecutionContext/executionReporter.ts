import { SchedulerReporter } from '../../../../application/ports/SchedulerReporter.js';
import { TaskScheduler } from '../../../../scheduler/TaskScheduler.js';
import { AppContainer } from '../../../../infrastructure/container.js';
import { CommandHookDispatcher } from '../../../../infrastructure/hooks/CommandHookDispatcher.js';
import { NoopHookDispatcher } from '../../../../infrastructure/hooks/NoopHookDispatcher.js';

export interface ExecutionReporterCallbacks {
  onStart?: (specName: string) => void;
  onUpdate?: (specName: string) => void;
  onComplete?: (specName: string) => void;
  onFail?: (specName: string) => void;
  onDeadlock?: (specName?: string) => void;
  onError?: (error: string | Error) => void;
  onLog?: (taskId: string, chunk: string) => void;
}

/**
 * Creates a SchedulerReporter instance bridging scheduler lifecycle events to callbacks.
 */
export function createExecutionReporter(
  callbacks: ExecutionReporterCallbacks,
): SchedulerReporter {
  return {
    onStart: (specName: string) => callbacks.onStart?.(specName),
    onUpdate: (specName: string) => callbacks.onUpdate?.(specName),
    onComplete: (specName: string) => callbacks.onComplete?.(specName),
    onFail: (specName: string) => callbacks.onFail?.(specName),
    onDeadlock: (specName?: string) => callbacks.onDeadlock?.(specName),
    onError: (error: string | Error) => callbacks.onError?.(error),
    onLog: (taskId: string, chunk: string) => callbacks.onLog?.(taskId, chunk),
  };
}

/**
 * Instantiates or configures the TaskScheduler for execution.
 */
export function createSchedulerInstance(
  appContainer: AppContainer,
  reporter: SchedulerReporter,
  propScheduler?: TaskScheduler,
): TaskScheduler {
  if (propScheduler) {
    propScheduler.setReporter(reporter);
    return propScheduler;
  }
  const config = appContainer.configService.loadConfig() ?? {
    environment: 'antigravity',
    plannerAgent: 'default',
    executorAgent: 'default',
    language: 'en',
  };
  const runner = appContainer.runnerProvider(config.environment);
  const hooks = config.hooks
    ? new CommandHookDispatcher(config.hooks, process.cwd(), appContainer.processExecutor)
    : new NoopHookDispatcher();
  return appContainer.createTaskScheduler(runner, config, reporter, hooks);
}
