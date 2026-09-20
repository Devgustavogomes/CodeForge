import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useExecution } from '../../../context/ExecutionContext.js';

export type DashboardPanel = 'tasks' | 'logs';

const ACTION_FEEDBACK_DURATION_MS = 3500;

/** Centraliza o estado processado e as ações da tela Run. */
export function useRunDashboard() {
  const exec = useExecution();
  const [focusedPanel, setFocusedPanel] = useState<DashboardPanel>('tasks');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFeedbackTimer = useCallback(() => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);
  const publishFeedback = useCallback((message: string) => {
    clearFeedbackTimer();
    setActionFeedback(message);
    feedbackTimerRef.current = setTimeout(() => {
      feedbackTimerRef.current = null;
      setActionFeedback(null);
    }, ACTION_FEEDBACK_DURATION_MS);
  }, [clearFeedbackTimer]);
  const beginAction = useCallback(() => {
    clearFeedbackTimer();
    setActionFeedback(null);
  }, [clearFeedbackTimer]);
  useEffect(() => clearFeedbackTimer, [clearFeedbackTimer]);

  const selectedTask = useMemo(
    () => exec.tasks.find((task) => task.id === exec.selectedTaskId) ?? null,
    [exec.tasks, exec.selectedTaskId],
  );
  const selectedTaskStatus = selectedTask?.status ?? null;
  const selectedTaskLogs = useMemo(
    () => (exec.selectedTaskId ? exec.getTaskLogs(exec.selectedTaskId) : undefined),
    [exec.getTaskLogs, exec.selectedTaskId],
  );

  const completedCount = useMemo(
    () => exec.tasks.filter((task) => task.status === 'completed').length,
    [exec.tasks],
  );
  const failedCount = useMemo(
    () => exec.tasks.filter((task) => task.status === 'failed').length,
    [exec.tasks],
  );
  const runningCount = useMemo(
    () => exec.tasks.filter((task) => task.status === 'running').length,
    [exec.tasks],
  );
  const pendingCount = useMemo(
    () => exec.tasks.filter((task) => task.status === 'pending').length,
    [exec.tasks],
  );
  const hasFailedTasks = failedCount > 0;
  const hasPendingTasks = pendingCount > 0;
  const derivedStartedAt = exec.startedAt ?? exec.tasks.find((task) => task.startedAt)?.startedAt;
  const derivedCompletedAt = useMemo(() => {
    if (exec.completedAt) return exec.completedAt;
    if (exec.tasks.length === 0 || !exec.tasks.every((task) => task.status === 'completed' || task.status === 'failed')) return undefined;
    return exec.tasks.filter((task) => task.completedAt).sort(
      (a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime(),
    )[0]?.completedAt;
  }, [exec.completedAt, exec.tasks]);

  const currentIntent = exec.activeIntent ?? exec.activeIntent;

  const onTogglePanel = useCallback(() => setFocusedPanel((panel) => panel === 'tasks' ? 'logs' : 'tasks'), []);
  const onFocusTasks = useCallback(() => setFocusedPanel('tasks'), []);
  const onFocusLogs = useCallback(() => setFocusedPanel('logs'), []);
  const onStartRun = useCallback(async () => {
    if (!currentIntent) return;
    beginAction();
    try { await exec.startRun(currentIntent); } catch { /* sem feedback falso */ }
  }, [beginAction, currentIntent, exec]);
  const onRetryTask = useCallback(async () => {
    if (!currentIntent || !selectedTask || selectedTask.status !== 'failed') return;
    beginAction();
    try {
      await exec.retryTask(selectedTask.id, currentIntent);
      await exec.startRun(currentIntent);
      publishFeedback(`✓ Task ${selectedTask.id} retried — scheduler resuming`);
    } catch { /* sem feedback falso */ }
  }, [beginAction, currentIntent, exec, publishFeedback, selectedTask]);
  const onRetryAllFailed = useCallback(async () => {
    if (!currentIntent) return;
    const failures = exec.tasks.filter((task) => task.status === 'failed').length;
    beginAction();
    if (failures === 0) {
      publishFeedback('Nenhuma task falhou');
      return;
    }
    try {
      await exec.retryAllFailed();
      await exec.startRun(currentIntent);
      publishFeedback(`✓ ${failures} failed tasks retried — scheduler resuming`);
    } catch { /* sem feedback falso */ }
  }, [beginAction, currentIntent, exec, publishFeedback]);
  const onResetAllTasks = useCallback(async () => {
    if (!currentIntent) return;
    beginAction();
    try {
      await exec.resetAllTasks(currentIntent);
      await exec.startRun(currentIntent);
      publishFeedback('✓ All tasks reset — restarting execution');
    } catch { /* sem feedback falso */ }
  }, [beginAction, currentIntent, exec, publishFeedback]);
  const onResetTask = useCallback(async () => {
    if (!currentIntent || !selectedTask) return;
    beginAction();
    try {
      await exec.resetTask(selectedTask.id, currentIntent);
      publishFeedback(`✓ Task ${selectedTask.id} reset to pending`);
    } catch { /* sem feedback falso */ }
  }, [beginAction, currentIntent, exec, publishFeedback, selectedTask]);
  const onCompleteTask = useCallback(async () => {
    if (!currentIntent || !selectedTask || selectedTask.status === 'completed') return;
    beginAction();
    try {
      await exec.completeTask(selectedTask.id, currentIntent);
      publishFeedback(`✓ Task ${selectedTask.id} marked as completed`);
    } catch { /* sem feedback falso */ }
  }, [beginAction, currentIntent, exec, publishFeedback, selectedTask]);
  const onSelectIntent = useCallback(() => {
    beginAction();
    if (typeof exec.setActiveIntent === 'function') {
      exec.setActiveIntent(null);
    }
  }, [beginAction, exec]);
  return {
    focusedPanel,
    setFocusedPanel,
    actionFeedback,
    tasks: exec.tasks,
    selectedTaskId: exec.selectedTaskId,
    selectedTask,
    selectedTaskStatus,
    selectedTaskLogs,
    logs: exec.logs,
    taskLogs: selectedTaskLogs,
    completedCount,
    failedCount,
    runningCount,
    pendingCount,
    totalCount: exec.tasks.length,
    hasFailedTasks,
    hasPendingTasks,
    startedAt: derivedStartedAt,
    completedAt: derivedCompletedAt,
    derivedStartedAt,
    derivedCompletedAt,
    activeHook: exec.activeHook,
    hookHistory: exec.hookHistory,
    hasConfiguredHooks: exec.hasConfiguredHooks ?? false,
    activeIntent: currentIntent,    currentIntent,    effectiveIntentName: currentIntent ?? '',    effectiveStatus: exec.schedulerStatus,
    selectTask: exec.selectTask,
    setActiveIntent: exec.setActiveIntent,    onTogglePanel,
    onFocusTasks,
    onFocusLogs,
    onStartRun,
    onRetryTask,
    onRetryAllFailed,
    onResetAllTasks,
    onResetTask,
    onCompleteTask,
    onSelectIntent,  };
}

export default useRunDashboard;
