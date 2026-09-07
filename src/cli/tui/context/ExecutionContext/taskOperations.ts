import { Dispatch, SetStateAction, useCallback } from 'react';
import { AppContainer } from '../../../../infrastructure/container.js';
import { ExecutionStatus, TaskItem } from './types.js';

export function useTaskOperations(
  activeSpec: string | null,
  appContainer: AppContainer,
  setTasks: Dispatch<SetStateAction<TaskItem[]>>,
  refreshTasks: (spec: string) => void,
  setSchedulerStatus: Dispatch<SetStateAction<ExecutionStatus>>,
) {
  const mutateTask = useCallback(
    (action: (spec: string) => void, optimisticTaskId?: string, optimisticStatus?: 'pending' | 'completed') => {
      if (!activeSpec) return;
      if (optimisticTaskId && optimisticStatus) {
        setTasks((prev) =>
          prev.map((t) => (t.id === optimisticTaskId ? { ...t, status: optimisticStatus, errors: undefined } : t)),
        );
      }
      action(activeSpec);
      refreshTasks(activeSpec);
      const state = appContainer.executionStateRepository.load(activeSpec);
      if (state) setSchedulerStatus(state.status as ExecutionStatus);
    },
    [activeSpec, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  const retryTask = useCallback(
    async (taskId: string) => mutateTask((s) => appContainer.taskOperationsUseCase.retryTask(s, taskId), taskId, 'pending'),
    [mutateTask, appContainer],
  );

  const retryAllFailed = useCallback(
    async () => {
      if (!activeSpec) return;
      setTasks((prev) => prev.map((t) => (t.status === 'failed' ? { ...t, status: 'pending', errors: undefined } : t)));
      appContainer.taskOperationsUseCase.retrySpec(activeSpec);
      refreshTasks(activeSpec);
      const state = appContainer.executionStateRepository.load(activeSpec);
      if (state) setSchedulerStatus(state.status as ExecutionStatus);
    },
    [activeSpec, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  const completeTask = useCallback(
    async (taskId: string) => mutateTask((s) => appContainer.taskOperationsUseCase.markTaskCompleted(s, taskId), taskId, 'completed'),
    [mutateTask, appContainer],
  );

  const resetTask = useCallback(
    async (taskId: string) => {
      if (!activeSpec) return;
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'pending', errors: undefined } : t)));
      const ops = appContainer.taskOperationsUseCase as unknown as {
        resetTask?: (s: string, id: string) => void;
        resetTasks: (s: string, id?: string) => void;
      };
      if (typeof ops.resetTask === 'function') {
        ops.resetTask(activeSpec, taskId);
      } else {
        ops.resetTasks(activeSpec, taskId);
      }
      refreshTasks(activeSpec);
      const state = appContainer.executionStateRepository.load(activeSpec);
      if (state) setSchedulerStatus(state.status as ExecutionStatus);
    },
    [activeSpec, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  const resetAllTasks = useCallback(
    async (specName?: string) => {
      const spec = specName || activeSpec;
      if (!spec) return;
      setTasks((prev) => prev.map((t) => ({ ...t, status: 'pending', errors: undefined })));
      appContainer.taskOperationsUseCase.resetTasks(spec);
      refreshTasks(spec);
      const state = appContainer.executionStateRepository.load(spec);
      setSchedulerStatus((state?.status as ExecutionStatus) ?? 'idle');
    },
    [activeSpec, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  return { retryTask, retryAllFailed, completeTask, resetTask, resetAllTasks };
}
