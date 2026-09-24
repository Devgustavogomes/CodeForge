import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createAppContainer } from '../../../infrastructure/container.js';
import { ContainerContext } from './ContainerContext.js';
import { loadTasksFromDisk, areTasksEqual } from './ExecutionContext/taskLoader.js';
import {
  sanitizeLogChunk,
  appendTaskLog,
  DEFAULT_MAX_LOG_LINES,
  LogEventBuffer,
} from './ExecutionContext/logBuffer.js';
import {
  createExecutionReporter,
  createHookReporter,
  createSchedulerInstance,
} from './ExecutionContext/executionReporter.js';
import { useTaskOperations } from './ExecutionContext/taskOperations.js';
import {
  ExecutionStatus,
  SchedulerStatus,
  TaskItem,
  ExecutionContextValue,
  ExecutionProviderProps,
  ActiveHookState,
  HookHistoryItem,
} from './ExecutionContext/types.js';
import { ReviewResultMetadata } from '../../../domain/hook.js';
import { useConfig } from './ConfigContext.js';

export const DEFAULT_LOG_FLUSH_INTERVAL_MS = 60;
const INTERRUPTED_REVIEW_MESSAGE = 'Previous AI review was interrupted. Press [v] to retry.';

export type {
  ExecutionStatus,
  SchedulerStatus,
  TaskItem,
  ExecutionContextValue,
  ExecutionProviderProps,
  ActiveHookState,
  HookHistoryItem,
};
export {
  sanitizeLogChunk,
  appendTaskLog,
  loadTasksFromDisk,
  DEFAULT_MAX_LOG_LINES,
  LogEventBuffer,
  areTasksEqual,
  createExecutionReporter,
  createHookReporter,
  createSchedulerInstance,
};

export const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export const ExecutionProvider: React.FC<ExecutionProviderProps> = ({
  children,
  scheduler: propScheduler,
  container: propContainer,
  initialIntent,
  autoStart = false,
  maxLogLines = DEFAULT_MAX_LOG_LINES,
  flushIntervalMs = DEFAULT_LOG_FLUSH_INTERVAL_MS,
  hookReporter: propHookReporter,
}) => {
  const contextContainer = useContext(ContainerContext) ?? undefined;
  const { config } = useConfig();
  const appContainer = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer],
  );

  const effectiveInitial = initialIntent ?? null;
  const [activeIntent, setActiveIntentState] = useState<string | null>(effectiveInitial);
  const activeIntentRef = useRef<string | null>(effectiveInitial);
  const [tasks, setTasksState] = useState<TaskItem[]>(() =>
    effectiveInitial ? loadTasksFromDisk(appContainer.workspaceGateway, appContainer.executionStateRepository, effectiveInitial) : [],
  );
  const tasksRef = useRef<TaskItem[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const setTasks: React.Dispatch<React.SetStateAction<TaskItem[]>> = useCallback((action) => {
    setTasksState((prev) => {
      const next = typeof action === 'function' ? (action as (p: TaskItem[]) => TaskItem[])(prev) : action;
      tasksRef.current = next;
      return next;
    });
  }, []);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => {
    if (!effectiveInitial) return null;
    const items = loadTasksFromDisk(appContainer.workspaceGateway, appContainer.executionStateRepository, effectiveInitial);
    return items[0]?.id ?? null;
  });
  const [schedulerStatus, setSchedulerStatus] = useState<ExecutionStatus>(() => {
    if (effectiveInitial) {
      const state = appContainer.executionStateRepository.load(effectiveInitial);
      if (state) return state.status === 'reviewing' ? 'paused' : state.status as ExecutionStatus;
    }
    return propScheduler ? propScheduler.getStatus() : 'idle';
  });
  const [startedAt, setStartedAt] = useState<string | undefined>(
    () => (effectiveInitial ? appContainer.executionStateRepository.load(effectiveInitial)?.startedAt : undefined),
  );
  const [completedAt, setCompletedAt] = useState<string | undefined>(
    () => (effectiveInitial ? appContainer.executionStateRepository.load(effectiveInitial)?.completedAt : undefined),
  );
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [activeHook, setActiveHook] = useState<ActiveHookState | null>(null);
  const [hookHistory, setHookHistory] = useState<HookHistoryItem[]>([]);
  const [reviewStartedAt, setReviewStartedAt] = useState<string | undefined>();
  const [reviewResult, setReviewResult] = useState<ReviewResultMetadata | undefined>();
  const [reviewError, setReviewError] = useState<string | undefined>();
  const reviewErrorRef = useRef(false);
  const reviewInFlightRef = useRef(false);
  const hookHistoryCounterRef = useRef(0);

  const hasConfiguredHooks = Object.values(config.hooks ?? {}).some(
    (hooks) => Array.isArray(hooks) && hooks.length > 0,
  );

  const logBufferRef = useRef<LogEventBuffer | null>(null);
  if (!logBufferRef.current) {
    logBufferRef.current = new LogEventBuffer(maxLogLines);
  }

  useEffect(() => {
    if (logBufferRef.current) {
      logBufferRef.current.setMaxLines(maxLogLines);
    }
  }, [maxLogLines]);

  const flushLogs = useCallback(() => {
    if (reviewInFlightRef.current) return;
    if (logBufferRef.current?.hasPending()) {
      setLogs(logBufferRef.current.flush());
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      flushLogs();
    }, flushIntervalMs);

    return () => {
      clearInterval(timer);
      if (logBufferRef.current?.hasPending()) {
        setLogs(logBufferRef.current.flush());
      }
    };
  }, [flushIntervalMs, flushLogs]);

  const refreshTasks = useCallback((intent: string) => {
    const items = loadTasksFromDisk(appContainer.workspaceGateway, appContainer.executionStateRepository, intent);
    if (!areTasksEqual(tasksRef.current, items)) {
      tasksRef.current = items;
      setTasksState(items);
    }
    setSelectedTaskId((prev) => (prev && items.some((t) => t.id === prev) ? prev : items[0]?.id ?? null));
  }, [appContainer]);

  const setActiveIntent = useCallback((intentName: string | null) => {
    if (intentName !== activeIntentRef.current) {
      logBufferRef.current?.clear();
      setLogs({});
    }
    activeIntentRef.current = intentName;
    setActiveIntentState(intentName);
    setActiveHook(null);
    setHookHistory([]);
    if (intentName) {
      refreshTasks(intentName);
      const state = appContainer.executionStateRepository.load(intentName);
      setSchedulerStatus(state?.status === 'reviewing' ? 'paused' : (state?.status as ExecutionStatus) ?? 'idle');
      setStartedAt(state?.startedAt);
      setCompletedAt(state?.completedAt);
      setReviewStartedAt(undefined);
      setReviewResult(undefined);
      const restoredError = state?.status === 'reviewing' ? INTERRUPTED_REVIEW_MESSAGE : state?.reviewError;
      setReviewError(restoredError);
      reviewErrorRef.current = Boolean(restoredError);
    } else {
      tasksRef.current = [];
      setTasksState([]);
      setSelectedTaskId(null);
      setSchedulerStatus('idle');
      setStartedAt(undefined);
      setCompletedAt(undefined);
      setReviewStartedAt(undefined);
      setReviewResult(undefined);
      setReviewError(undefined);
      reviewErrorRef.current = false;
    }
  }, [appContainer, refreshTasks]);

  useEffect(() => {
    if (effectiveInitial) setActiveIntent(effectiveInitial);
  }, [effectiveInitial, setActiveIntent]);

  const appendLog = useCallback((taskId: string, chunk: string) => {
    logBufferRef.current?.append(taskId, chunk);
  }, []);

  const reporter = useMemo(() => createExecutionReporter({
    onStart: (s) => {
      setSchedulerStatus('running');
      setStartedAt(new Date().toISOString());
      setCompletedAt(undefined);
      refreshTasks(s);
      reviewErrorRef.current = false;
      setReviewError(undefined);
    },
    onUpdate: (s) => refreshTasks(s),
    onComplete: (s) => {
      flushLogs();
      setSchedulerStatus('completed');
      setCompletedAt(new Date().toISOString());
      refreshTasks(s);
    },
    onFail: (s) => {
      flushLogs();
      setSchedulerStatus('failed');
      setCompletedAt(new Date().toISOString());
      refreshTasks(s);
    },
    onDeadlock: (s) => {
      flushLogs();
      setSchedulerStatus('deadlock');
      setCompletedAt(new Date().toISOString());
      if (s) refreshTasks(s);
    },
    onError: () => {
      if (!reviewErrorRef.current) setSchedulerStatus('failed');
    },
    onLog: (taskId, chunk) => appendLog(taskId, chunk),
    onReviewStart: (s) => {
      reviewInFlightRef.current = true;
      logBufferRef.current?.clear('review');
      setLogs(logBufferRef.current?.flush() ?? {});
      reviewErrorRef.current = false;
      setSchedulerStatus('reviewing');
      setReviewStartedAt(new Date().toISOString());
      setReviewResult(undefined);
      setReviewError(undefined);
      refreshTasks(s);
    },
    onReviewEnd: (s, result) => {
      reviewInFlightRef.current = false;
      flushLogs();
      setReviewResult(result);
      setReviewError(undefined);
      setReviewStartedAt(undefined);
      refreshTasks(s);
    },
    onReviewError: (s, error) => {
      reviewInFlightRef.current = false;
      appendLog('review', `ERROR: ${error}`);
      flushLogs();
      reviewErrorRef.current = true;
      setSchedulerStatus('paused');
      setReviewStartedAt(undefined);
      setReviewError(error);
      refreshTasks(s);
    },
  }), [refreshTasks, flushLogs, appendLog]);

  const hookReporter = useMemo(() => createHookReporter({
    onHookStart: (info) => {
      setActiveHook({
        name: info.definition.name,
        event: info.event,
        command: info.definition.run,
        type: info.definition.type ?? 'notify',
        taskId: info.context.taskId,
        startedAt: info.startedAt,
      });
      propHookReporter?.onHookStart(info);
    },
    onHookEnd: (info) => {
      setActiveHook(null);
      hookHistoryCounterRef.current += 1;
      const historyItem: HookHistoryItem = {
        id: `hook-${Date.now()}-${hookHistoryCounterRef.current}`,
        name: info.definition.name,
        event: info.event,
        command: info.definition.run,
        type: info.result.type ?? info.definition.type ?? 'notify',
        ok: info.result.ok,
        exitCode: info.result.exitCode,
        outputSummary: info.result.output?.trim() || undefined,
        durationMs: info.durationMs,
        timestamp: new Date().toISOString(),
      };
      setHookHistory((prev) => [historyItem, ...prev].slice(0, 10));
      propHookReporter?.onHookEnd(info);
    },
  }), [propHookReporter]);

  const scheduler = useMemo(
    () => createSchedulerInstance(appContainer, reporter, propScheduler, hookReporter, config),
    [propScheduler, appContainer, reporter, hookReporter, config],
  );
  useEffect(() => {
    if (scheduler) {
      scheduler.setReporter(reporter);
      scheduler.setHookReporter(hookReporter);
    }
  }, [scheduler, reporter, hookReporter]);

  const startRun = useCallback(async (intentName?: string): Promise<void> => {
    const intent = intentName || activeIntent;
    if (!intent || !scheduler) return;
    if (schedulerStatus === 'running' || schedulerStatus === 'reviewing') return;
    if (intent !== activeIntent) setActiveIntent(intent);
    setSchedulerStatus('running');
    try {
      const result = await scheduler.run(intent, config?.executorAgent);
      setSchedulerStatus(result.status as ExecutionStatus);
    } catch {
      setSchedulerStatus('failed');
    } finally {
      flushLogs();
      refreshTasks(intent);
      const state = appContainer.executionStateRepository.load(intent);
      if (state) setSchedulerStatus(state.status as ExecutionStatus);
    }
  }, [activeIntent, scheduler, schedulerStatus, setActiveIntent, refreshTasks, appContainer, flushLogs, config]);

  const startReview = useCallback(async (intentName?: string): Promise<void> => {
    const intent = intentName || activeIntent;
    if (!intent || !scheduler || reviewInFlightRef.current || schedulerStatus === 'running' || schedulerStatus === 'reviewing') return;
    // A review is deliberately only available once every existing task has finished.
    if (tasksRef.current.length === 0 || !tasksRef.current.every((task) => task.status === 'completed')) return;
    reviewInFlightRef.current = true;
    if (intent !== activeIntent) setActiveIntent(intent);
    reviewErrorRef.current = false;
    setReviewError(undefined);
    try {
      await scheduler.run(intent, config?.executorAgent, { forceReview: true });
    } catch (error) {
      reviewErrorRef.current = true;
      setSchedulerStatus('paused');
      setReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      reviewInFlightRef.current = false;
      flushLogs();
      refreshTasks(intent);
      const state = appContainer.executionStateRepository.load(intent);
      if (state) setSchedulerStatus(state.status as ExecutionStatus);
    }
  }, [activeIntent, appContainer, flushLogs, refreshTasks, scheduler, schedulerStatus, setActiveIntent, config]);

  const autoStartedIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoStart || !effectiveInitial || autoStartedIntentRef.current === effectiveInitial) return;
    autoStartedIntentRef.current = effectiveInitial;
    void startRun(effectiveInitial);
  }, [autoStart, effectiveInitial, startRun]);

  const { retryTask, retryAllFailed, completeTask, resetTask, resetAllTasks } = useTaskOperations(
    activeIntent, appContainer, setTasks, refreshTasks, setSchedulerStatus,
  );

  const getTaskLogs = useCallback((taskId: string) => logs[taskId] || [], [logs]);
  const clearLogs = useCallback((taskId?: string) => {
    if (logBufferRef.current) {
      logBufferRef.current.clear(taskId);
      setLogs(logBufferRef.current.flush());
    } else {
      setLogs({});
    }
  }, []);

  const selectTask = useCallback((taskId: string | null) => setSelectedTaskId(taskId), []);
  const selectedTask = useMemo(() => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) || null : null), [tasks, selectedTaskId]);

  const value: ExecutionContextValue = useMemo(() => ({
    activeIntent, tasks, selectedTaskId, selectedTask, status: schedulerStatus,
    schedulerStatus, logs, getTaskLogs, setSelectedTaskId, selectTask,
    setActiveIntent, startRun, retryTask, retryAllFailed, completeTask,
    resetTask, resetAllTasks, refreshTasks, clearLogs, scheduler, startedAt, completedAt,
    reviewStartedAt, reviewResult, reviewError, startReview,
    activeHook, hookHistory, hasConfiguredHooks,
  }), [
    activeIntent, tasks, selectedTaskId, selectedTask, schedulerStatus, logs, getTaskLogs,
    selectTask, setActiveIntent, startRun, retryTask, retryAllFailed, completeTask,
    resetTask, resetAllTasks, refreshTasks, clearLogs, scheduler, startedAt, completedAt,
    reviewStartedAt, reviewResult, reviewError, startReview,
    activeHook, hookHistory, hasConfiguredHooks,
  ]);

  return <ExecutionContext.Provider value={value}>{children}</ExecutionContext.Provider>;
};

export function useExecution(): ExecutionContextValue {
  const context = useContext(ExecutionContext);
  if (!context) {
    throw new Error('useExecution must be used within an ExecutionProvider');
  }
  return context;
}
