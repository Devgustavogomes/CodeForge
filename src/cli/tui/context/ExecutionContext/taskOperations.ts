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
    (
      action: (spec: string) => void,
      optimisticTaskId?: string,
      optimisticStatus?: 'pending' | 'completed',
      specName?: string,
    ) => {
      const spec = specName || activeSpec;
      if (!spec) return;
      if (optimisticTaskId && optimisticStatus && spec === activeSpec) {
        setTasks((prev) =>
          prev.map((t) => (t.id === optimisticTaskId ? { ...t, status: optimisticStatus, errors: undefined } : t)),
        );
      }
      action(spec);
      if (spec === activeSpec) {
        refreshTasks(spec);
        const state = appContainer.executionStateRepository.load(spec);
        if (state) setSchedulerStatus(state.status as ExecutionStatus);
      }
    },
    [activeSpec, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  const retryTask = useCallback(
    async (taskId: string, specName?: string) =>
      mutateTask((s) => appContainer.taskOperationsUseCase.retryTask(s, taskId), taskId, 'pending', specName),
    [mutateTask, appContainer],
  );

  const retryAllFailed = useCallback(
    async (specName?: string) => {
      const spec = specName || activeSpec;
      if (!spec) return;
      if (spec === activeSpec) {
        setTasks((prev) => prev.map((t) => (t.status === 'failed' ? { ...t, status: 'pending', errors: undefined } : t)));
      }
      appContainer.taskOperationsUseCase.retrySpec(spec);
      if (spec === activeSpec) {
        refreshTasks(spec);
        const state = appContainer.executionStateRepository.load(spec);
        if (state) setSchedulerStatus(state.status as ExecutionStatus);
      }
    },
    [activeSpec, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  const completeTask = useCallback(
    async (taskId: string, specName?: string) =>
      mutateTask((s) => appContainer.taskOperationsUseCase.markTaskCompleted(s, taskId), taskId, 'completed', specName),
    [mutateTask, appContainer],
  );

  const resetTask = useCallback(
    async (taskId: string, specName?: string) => {
      const spec = specName || activeSpec;
      if (!spec) return;
      if (spec === activeSpec) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'pending', errors: undefined } : t)));
      }
      const ops = appContainer.taskOperationsUseCase as unknown as {
        resetTask?: (s: string, id: string) => void;
        resetTasks: (s: string, id?: string) => void;
      };
      if (typeof ops.resetTask === 'function') {
        ops.resetTask(spec, taskId);
      } else {
        ops.resetTasks(spec, taskId);
      }
      if (spec === activeSpec) {
        refreshTasks(spec);
        const state = appContainer.executionStateRepository.load(spec);
        if (state) setSchedulerStatus(state.status as ExecutionStatus);
      }
    },
    [activeSpec, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  const resetAllTasks = useCallback(
    async (specName?: string) => {
      const spec = specName || activeSpec;
      if (!spec) return;
      if (spec === activeSpec) {
        setTasks((prev) => prev.map((t) => ({ ...t, status: 'pending', errors: undefined })));
      }
      appContainer.taskOperationsUseCase.resetTasks(spec);
      if (spec === activeSpec) {
        refreshTasks(spec);
        const state = appContainer.executionStateRepository.load(spec);
        setSchedulerStatus((state?.status as ExecutionStatus) ?? 'idle');
      }
    },
    [activeSpec, appContainer, refreshTasks, setTasks, setSchedulerStatus],
  );

  return { retryTask, retryAllFailed, completeTask, resetTask, resetAllTasks };
}
