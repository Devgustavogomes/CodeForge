import { Dispatch, SetStateAction, useCallback } from 'react';
import { AppContainer } from '../../../../infrastructure/container.js';
import { ExecutionStatus, TaskItem } from './types.js';

export function useTaskOperations(
  activeIntent: string | null,
  appContainer: AppContainer,
  setTasks: Dispatch<SetStateAction<TaskItem[]>>,
  refreshTasks: (intent: string) => void,
  setSchedulerStatus: Dispatch<SetStateAction<ExecutionStatus>>,
) {
  const mutateTask = useCallback(
    (
      action: (intent: string) => void,
      optimisticTaskId?: string,
      optimisticStatus?: 'pending' | 'completed',
      intentName?: string,
    ) => {
      const intent = intentName || activeIntent;
      if (!intent) return;
      if (optimisticTaskId && optimisticStatus && intent === activeIntent) {
        setTasks((prev) =>
          prev.map((t) => (t.id === optimisticTaskId ? { ...t, status: optimisticStatus, errors: undefined } : t)),
        );
      }
      action(intent);
      if (intent === activeIntent) {
        refreshTasks(intent);
        const state = appContainer.executionStateRepository.load(intent);
        if (state) setSchedulerStatus(state.status as ExecutionStatus);
      }
    },
    [activeIntent, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  const retryTask = useCallback(
    async (taskId: string, intentName?: string) =>
      mutateTask((s) => appContainer.taskOperationsUseCase.retryTask(s, taskId), taskId, 'pending', intentName),
    [mutateTask, appContainer],
  );

  const retryAllFailed = useCallback(
    async (intentName?: string) => {
      const intent = intentName || activeIntent;
      if (!intent) return;
      if (intent === activeIntent) {
        setTasks((prev) => prev.map((t) => (t.status === 'failed' ? { ...t, status: 'pending', errors: undefined } : t)));
      }
      appContainer.taskOperationsUseCase.retryIntent(intent);
      if (intent === activeIntent) {
        refreshTasks(intent);
        const state = appContainer.executionStateRepository.load(intent);
        if (state) setSchedulerStatus(state.status as ExecutionStatus);
      }
    },
    [activeIntent, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  const completeTask = useCallback(
    async (taskId: string, intentName?: string) =>
      mutateTask((s) => appContainer.taskOperationsUseCase.markTaskCompleted(s, taskId), taskId, 'completed', intentName),
    [mutateTask, appContainer],
  );

  const resetTask = useCallback(
    async (taskId: string, intentName?: string) => {
      const intent = intentName || activeIntent;
      if (!intent) return;
      if (intent === activeIntent) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'pending', errors: undefined } : t)));
      }
      const ops = appContainer.taskOperationsUseCase as unknown as {
        resetTask?: (s: string, id: string) => void;
        resetTasks: (s: string, id?: string) => void;
      };
      if (typeof ops.resetTask === 'function') {
        ops.resetTask(intent, taskId);
      } else {
        ops.resetTasks(intent, taskId);
      }
      if (intent === activeIntent) {
        refreshTasks(intent);
        const state = appContainer.executionStateRepository.load(intent);
        if (state) setSchedulerStatus(state.status as ExecutionStatus);
      }
    },
    [activeIntent, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  const resetAllTasks = useCallback(
    async (intentName?: string) => {
      const intent = intentName || activeIntent;
      if (!intent) return;
      if (intent === activeIntent) {
        setTasks((prev) => prev.map((t) => ({ ...t, status: 'pending', errors: undefined })));
      }
      appContainer.taskOperationsUseCase.resetTasks(intent);
      if (intent === activeIntent) {
        refreshTasks(intent);
        const state = appContainer.executionStateRepository.load(intent);
        setSchedulerStatus((state?.status as ExecutionStatus) ?? 'idle');
      }
    },
    [activeIntent, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  return { retryTask, retryAllFailed, completeTask, resetTask, resetAllTasks };
}
