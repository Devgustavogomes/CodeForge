import { SchedulerReporter } from '../../../../application/ports/SchedulerReporter.js';
import {
  HookReporter,
  ActiveHookInfo,
  CompletedHookInfo,
} from '../../../../application/ports/HookReporter.js';
import { TaskScheduler } from '../../../../scheduler/TaskScheduler.js';
import { AppContainer } from '../../../../infrastructure/container.js';
import { CommandHookDispatcher } from '../../../../infrastructure/hooks/CommandHookDispatcher.js';
import { NoopHookDispatcher } from '../../../../infrastructure/hooks/NoopHookDispatcher.js';
import { ReviewResultMetadata } from '../../../../domain/hook.js';
import { CodeForgeConfig } from '../../../../config/types.js';

export interface ExecutionReporterCallbacks {
  onStart?: (intentName: string) => void;
  onUpdate?: (intentName: string) => void;
  onComplete?: (intentName: string) => void;
  onFail?: (intentName: string) => void;
  onDeadlock?: (intentName?: string) => void;
  onError?: (error: string | Error) => void;
  onLog?: (taskId: string, chunk: string) => void;
  onReviewStart?: (intentName: string) => void;
  onReviewEnd?: (intentName: string, result: ReviewResultMetadata) => void;
  onReviewError?: (intentName: string, error: string) => void;
}

export interface HookReporterCallbacks {
  onHookStart?: (info: ActiveHookInfo) => void;
  onHookEnd?: (info: CompletedHookInfo) => void;
}

/**
 * Creates a SchedulerReporter instance bridging scheduler lifecycle events to callbacks.
 */
export function createExecutionReporter(
  callbacks: ExecutionReporterCallbacks,
): SchedulerReporter {
  return {
    onStart: (intentName: string) => callbacks.onStart?.(intentName),
    onUpdate: (intentName: string) => callbacks.onUpdate?.(intentName),
    onComplete: (intentName: string) => callbacks.onComplete?.(intentName),
    onFail: (intentName: string) => callbacks.onFail?.(intentName),
    onDeadlock: (intentName?: string) => callbacks.onDeadlock?.(intentName),
    onError: (error: string | Error) => callbacks.onError?.(error),
    onLog: (taskId: string, chunk: string) => callbacks.onLog?.(taskId, chunk),
    onReviewStart: (intentName) => callbacks.onReviewStart?.(intentName),
    onReviewEnd: (intentName, result) => callbacks.onReviewEnd?.(intentName, result),
    onReviewError: (intentName, error) => callbacks.onReviewError?.(intentName, error.message),
  };
}

/**
 * Creates a HookReporter instance bridging hook lifecycle events to callbacks.
 */
export function createHookReporter(
  callbacks: HookReporterCallbacks,
): HookReporter {
  return {
    onHookStart: (info: ActiveHookInfo) => callbacks.onHookStart?.(info),
    onHookEnd: (info: CompletedHookInfo) => callbacks.onHookEnd?.(info),
  };
}

/**
 * Instantiates or configures the TaskScheduler for execution.
 */
export function createSchedulerInstance(
  appContainer: AppContainer,
  reporter: SchedulerReporter,
  propScheduler?: TaskScheduler,
  hookReporter?: HookReporter,
  selectedConfig?: CodeForgeConfig,
): TaskScheduler {
  if (propScheduler) {
    propScheduler.setReporter(reporter);
    if (hookReporter) {
      propScheduler.setHookReporter(hookReporter);
    }
    return propScheduler;
  }
  const config = selectedConfig ?? appContainer.configService.loadConfig() ?? {
    environment: 'antigravity',
    plannerAgent: 'default',
    executorAgent: 'default',
    language: 'en',
  };
  const runner = appContainer.runnerProvider(config.environment);
  const effectiveHookReporter = hookReporter ?? appContainer.hookReporter;
  const hooks = config.hooks
    ? new CommandHookDispatcher(
        config.hooks,
        process.cwd(),
        appContainer.processExecutor,
        effectiveHookReporter,
      )
    : new NoopHookDispatcher();
  if (effectiveHookReporter && hooks instanceof CommandHookDispatcher) {
    hooks.setReporter(effectiveHookReporter);
  }
  const scheduler = appContainer.createTaskScheduler(
    runner,
    config,
    reporter,
    hooks,
    effectiveHookReporter,
  );
  if (effectiveHookReporter) {
    scheduler.setHookReporter(effectiveHookReporter);
  }
  return scheduler;
}
