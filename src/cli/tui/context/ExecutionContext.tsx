import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { TaskScheduler } from '../../../scheduler/TaskScheduler.js';
import { AppContainer, createAppContainer } from '../../../infrastructure/container.js';
import { ContainerContext } from './ContainerContext.js';
import { loadTasksFromDisk } from './ExecutionContext/taskLoader.js';
import { sanitizeLogChunk, appendTaskLog, DEFAULT_MAX_LOG_LINES } from './ExecutionContext/logBuffer.js';
import { createExecutionReporter, createSchedulerInstance } from './ExecutionContext/executionReporter.js';
import { useTaskOperations } from './ExecutionContext/taskOperations.js';
import {
  ExecutionStatus,
  SchedulerStatus,
  TaskItem,
  ExecutionContextValue,
  ExecutionProviderProps,
} from './ExecutionContext/types.js';

export type { ExecutionStatus, SchedulerStatus, TaskItem, ExecutionContextValue, ExecutionProviderProps };
export { sanitizeLogChunk, loadTasksFromDisk, DEFAULT_MAX_LOG_LINES };

export const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export const ExecutionProvider: React.FC<ExecutionProviderProps> = ({
  children,
  scheduler: propScheduler,
  container: propContainer,
  initialSpec,
  autoStart = false,
  maxLogLines = DEFAULT_MAX_LOG_LINES,
}) => {
  const contextContainer = useContext(ContainerContext) ?? undefined;
  const appContainer = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer],
  );

  const [activeSpec, setActiveSpecState] = useState<string | null>(initialSpec ?? null);
  const [tasks, setTasks] = useState<TaskItem[]>(() =>
    initialSpec ? loadTasksFromDisk(appContainer.workspaceGateway, appContainer.executionStateRepository, initialSpec) : [],
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => {
    if (!initialSpec) return null;
    const items = loadTasksFromDisk(appContainer.workspaceGateway, appContainer.executionStateRepository, initialSpec);
    return items[0]?.id ?? null;
  });
  const [schedulerStatus, setSchedulerStatus] = useState<ExecutionStatus>(() => {
    if (initialSpec) {
      const state = appContainer.executionStateRepository.load(initialSpec);
      if (state) return state.status as ExecutionStatus;
    }
    return propScheduler ? propScheduler.getStatus() : 'idle';
  });
  const [startedAt, setStartedAt] = useState<string | undefined>(
    () => (initialSpec ? appContainer.executionStateRepository.load(initialSpec)?.startedAt : undefined),
  );
  const [completedAt, setCompletedAt] = useState<string | undefined>(
    () => (initialSpec ? appContainer.executionStateRepository.load(initialSpec)?.completedAt : undefined),
  );
  const [logs, setLogs] = useState<Record<string, string[]>>({});

  const refreshTasks = useCallback((spec: string) => {
    const items = loadTasksFromDisk(appContainer.workspaceGateway, appContainer.executionStateRepository, spec);
    setTasks(items);
    setSelectedTaskId((prev) => (prev && items.some((t) => t.id === prev) ? prev : items[0]?.id ?? null));
  }, [appContainer]);

  const setActiveSpec = useCallback((specName: string | null) => {
    setActiveSpecState(specName);
    if (specName) {
      refreshTasks(specName);
      const state = appContainer.executionStateRepository.load(specName);
      setSchedulerStatus((state?.status as ExecutionStatus) ?? 'idle');
      setStartedAt(state?.startedAt);
      setCompletedAt(state?.completedAt);
    } else {
      setTasks([]);
      setSelectedTaskId(null);
      setSchedulerStatus('idle');
      setStartedAt(undefined);
      setCompletedAt(undefined);
    }
  }, [appContainer, refreshTasks]);

  useEffect(() => {
    if (initialSpec) setActiveSpec(initialSpec);
  }, [initialSpec, setActiveSpec]);

  const appendLog = useCallback((taskId: string, chunk: string) => {
    setLogs((prev) => appendTaskLog(prev, taskId, chunk, maxLogLines));
  }, [maxLogLines]);

  const reporter = useMemo(() => createExecutionReporter({
    onStart: (s) => { setSchedulerStatus('running'); setStartedAt(new Date().toISOString()); setCompletedAt(undefined); refreshTasks(s); },
    onUpdate: (s) => refreshTasks(s),
    onComplete: (s) => { setSchedulerStatus('completed'); setCompletedAt(new Date().toISOString()); refreshTasks(s); },
    onFail: (s) => { setSchedulerStatus('failed'); setCompletedAt(new Date().toISOString()); refreshTasks(s); },
    onDeadlock: (s) => { setSchedulerStatus('deadlock'); setCompletedAt(new Date().toISOString()); if (s) refreshTasks(s); },
    onError: () => setSchedulerStatus('failed'),
    onLog: (taskId, chunk) => appendLog(taskId, chunk),
  }), [refreshTasks, appendLog]);

  const scheduler = useMemo(() => createSchedulerInstance(appContainer, reporter, propScheduler), [propScheduler, appContainer, reporter]);
  useEffect(() => { if (scheduler) scheduler.setReporter(reporter); }, [scheduler, reporter]);

  const startRun = useCallback(async (specName?: string): Promise<void> => {
    const spec = specName || activeSpec;
    if (!spec || !scheduler) return;
    if (spec !== activeSpec) setActiveSpec(spec);
    setSchedulerStatus('running');
    try {
      const config = appContainer.configService.loadConfig();
      const result = await scheduler.run(spec, config?.executorAgent);
      setSchedulerStatus(result.status as ExecutionStatus);
    } catch {
      setSchedulerStatus('failed');
    } finally {
      refreshTasks(spec);
      const state = appContainer.executionStateRepository.load(spec);
      if (state) setSchedulerStatus(state.status as ExecutionStatus);
    }
  }, [activeSpec, scheduler, setActiveSpec, refreshTasks, appContainer]);

  useEffect(() => {
    if (autoStart && initialSpec) void startRun(initialSpec);
  }, [autoStart, initialSpec, startRun]);

  const { retryTask, retryAllFailed, completeTask, resetTask, resetAllTasks } = useTaskOperations(
    activeSpec, appContainer, setTasks, refreshTasks, setSchedulerStatus,
  );

  const getTaskLogs = useCallback((taskId: string) => logs[taskId] || [], [logs]);
  const clearLogs = useCallback((taskId?: string) => {
    setLogs((prev) => {
      if (!taskId) return {};
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  const selectTask = useCallback((taskId: string | null) => setSelectedTaskId(taskId), []);
  const selectedTask = useMemo(() => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) || null : null), [tasks, selectedTaskId]);

  const value: ExecutionContextValue = useMemo(() => ({
    activeSpec, tasks, selectedTaskId, selectedTask, status: schedulerStatus,
    schedulerStatus, logs, getTaskLogs, setSelectedTaskId, selectTask,
    setActiveSpec, startRun, retryTask, retryAllFailed, completeTask,
    resetTask, resetAllTasks, clearLogs, scheduler, startedAt, completedAt,
  }), [
    activeSpec, tasks, selectedTaskId, selectedTask, schedulerStatus, logs, getTaskLogs,
    selectTask, setActiveSpec, startRun, retryTask, retryAllFailed, completeTask,
    resetTask, resetAllTasks, clearLogs, scheduler, startedAt, completedAt,
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
