import { useState, useMemo } from 'react';
import { TaskItem, ExecutionStatus, useExecution } from '../../../context/ExecutionContext.js';

export type DashboardPanel = 'tasks' | 'logs';

export interface UseRunDashboardOptions {
  tasks?: TaskItem[];
  selectedTaskId?: string | null;
  selectedTask?: TaskItem | null;
  onStartRun?: (specName?: string) => void;
  onRetryTask?: (taskId: string) => void;
  onRetryAllFailed?: () => void;
  onCompleteTask?: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
  onResetAllTasks?: () => void;
  defaultFocusedPanel?: DashboardPanel;
  specName?: string;
  schedulerStatus?: ExecutionStatus | string;
  startedAt?: string;
  completedAt?: string;
  onSelectSpec?: () => void;
  logs?: Record<string, string[]>;
  taskLogs?: string[];
}

export function useRunDashboard(options: UseRunDashboardOptions = {}) {
  const exec = useExecution();
  const [focusedPanel, setFocusedPanel] = useState<DashboardPanel>(
    options.defaultFocusedPanel ?? 'tasks',
  );

  const tasks = options.tasks ?? exec.tasks;
  const selectedTaskId =
    options.selectedTaskId !== undefined ? options.selectedTaskId : exec.selectedTaskId;
  const selectedTask =
    options.selectedTask !== undefined
      ? options.selectedTask
      : selectedTaskId
        ? tasks.find((t) => t.id === selectedTaskId) || null
        : exec.selectedTask;

  const startRun = options.onStartRun ?? exec.startRun;
  const retryTask = options.onRetryTask ?? exec.retryTask;
  const retryAllFailed = options.onRetryAllFailed ?? exec.retryAllFailed;
  const completeTask = options.onCompleteTask ?? exec.completeTask;
  const resetTask = options.onResetTask ?? exec.resetTask;
  const resetAllTasks = options.onResetAllTasks ?? exec.resetAllTasks;

  const effectiveSpecName = options.specName ?? exec.activeSpec ?? 'current-spec';
  const effectiveStatus = options.schedulerStatus ?? exec.schedulerStatus;

  const derivedStartedAt =
    options.startedAt ?? exec.startedAt ?? tasks.find((t) => t.startedAt)?.startedAt;

  const derivedCompletedAt =
    options.completedAt ??
    exec.completedAt ??
    (tasks.length > 0 && tasks.every((t) => t.status === 'completed' || t.status === 'failed')
      ? tasks
          .filter((t) => t.completedAt)
          .sort(
            (a, b) =>
              new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime(),
          )[0]?.completedAt
      : undefined);

  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === 'completed').length,
    [tasks],
  );
  const failedCount = useMemo(
    () => tasks.filter((t) => t.status === 'failed').length,
    [tasks],
  );
  const runningCount = useMemo(
    () => tasks.filter((t) => t.status === 'running').length,
    [tasks],
  );
  const pendingCount = useMemo(
    () => tasks.filter((t) => t.status === 'pending').length,
    [tasks],
  );
  const totalCount = tasks.length;

  const selectedTaskLogs =
    options.taskLogs !== undefined
      ? options.taskLogs
      : (selectedTaskId ? (options.logs?.[selectedTaskId] ?? exec.getTaskLogs(selectedTaskId)) : undefined);

  return {
    focusedPanel,
    setFocusedPanel,
    tasks,
    selectedTaskId,
    selectedTask,
    logs: options.logs ?? exec.logs,
    taskLogs: selectedTaskLogs,
    completedCount,
    failedCount,
    runningCount,
    pendingCount,
    totalCount,
    effectiveSpecName,
    effectiveStatus,
    derivedStartedAt,
    derivedCompletedAt,
    startRun,
    retryTask,
    retryAllFailed,
    completeTask,
    resetTask,
    resetAllTasks,
    selectTask: exec.selectTask,
    setActiveSpec: exec.setActiveSpec,
    onSelectSpec: options.onSelectSpec,
  };
}

export default useRunDashboard;
