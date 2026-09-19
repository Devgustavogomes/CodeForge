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
import { createExecutionReporter, createSchedulerInstance } from './ExecutionContext/executionReporter.js';
import { useTaskOperations } from './ExecutionContext/taskOperations.js';
import {
  ExecutionStatus,
  SchedulerStatus,
  TaskItem,
  ExecutionContextValue,
  ExecutionProviderProps,
} from './ExecutionContext/types.js';

export const DEFAULT_LOG_FLUSH_INTERVAL_MS = 60;

export type { ExecutionStatus, SchedulerStatus, TaskItem, ExecutionContextValue, ExecutionProviderProps };
export {
  sanitizeLogChunk,
  appendTaskLog,
  loadTasksFromDisk,
  DEFAULT_MAX_LOG_LINES,
  LogEventBuffer,
  areTasksEqual,
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
}) => {
  const contextContainer = useContext(ContainerContext) ?? undefined;
  const appContainer = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer],
  );

  const effectiveInitial = initialIntent ?? null;
  const [activeIntent, setActiveIntentState] = useState<string | null>(effectiveInitial);
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
      if (state) return state.status as ExecutionStatus;
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
    setActiveIntentState(intentName);
    if (intentName) {
      refreshTasks(intentName);
      const state = appContainer.executionStateRepository.load(intentName);
      setSchedulerStatus((state?.status as ExecutionStatus) ?? 'idle');
      setStartedAt(state?.startedAt);
      setCompletedAt(state?.completedAt);
    } else {
      tasksRef.current = [];
      setTasksState([]);
      setSelectedTaskId(null);
      setSchedulerStatus('idle');
      setStartedAt(undefined);
      setCompletedAt(undefined);
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
    onError: () => setSchedulerStatus('failed'),
    onLog: (taskId, chunk) => appendLog(taskId, chunk),
  }), [refreshTasks, flushLogs, appendLog]);

  const scheduler = useMemo(() => createSchedulerInstance(appContainer, reporter, propScheduler), [propScheduler, appContainer, reporter]);
  useEffect(() => { if (scheduler) scheduler.setReporter(reporter); }, [scheduler, reporter]);

  const startRun = useCallback(async (intentName?: string): Promise<void> => {
    const intent = intentName || activeIntent;
    if (!intent || !scheduler) return;
    if (intent !== activeIntent) setActiveIntent(intent);
    setSchedulerStatus('running');
    try {
      const config = appContainer.configService.loadConfig();
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
  }, [activeIntent, scheduler, setActiveIntent, refreshTasks, appContainer, flushLogs]);

  useEffect(() => {
    if (autoStart && effectiveInitial) void startRun(effectiveInitial);
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
    activeIntent,    tasks, selectedTaskId, selectedTask, status: schedulerStatus,
    schedulerStatus, logs, getTaskLogs, setSelectedTaskId, selectTask,
    setActiveIntent,    startRun, retryTask, retryAllFailed, completeTask,
    resetTask, resetAllTasks, refreshTasks, clearLogs, scheduler, startedAt, completedAt,
  }), [
    activeIntent, tasks, selectedTaskId, selectedTask, schedulerStatus, logs, getTaskLogs,
    selectTask, setActiveIntent, startRun, retryTask, retryAllFailed, completeTask,
    resetTask, resetAllTasks, refreshTasks, clearLogs, scheduler, startedAt, completedAt,
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
