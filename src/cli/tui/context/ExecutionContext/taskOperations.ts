import { Dispatch, SetStateAction, useCallback } from 'react';
import { AppContainer } from '../../../../infrastructure/container.js';
import { ExecutionStatus, TaskItem } from './types.js';

export function useTaskOperations(
  activeIntent: string | null,
  appContainer: AppContainer,
  _setTasks: Dispatch<SetStateAction<TaskItem[]>>,
  refreshTasks: (intent: string) => void,
  setSchedulerStatus: Dispatch<SetStateAction<ExecutionStatus>>,
) {
  const mutateTask = useCallback(
    async (
      action: (intent: string) => { kind: string; message?: string } | Promise<{ kind: string; message?: string }>,
      successKinds: string[],
      intentName?: string,
    ) => {
      const intent = intentName || activeIntent;
      if (!intent) return;
      const result = await action(intent);
      if (intent === activeIntent) {
        refreshTasks(intent);
        const state = appContainer.executionStateRepository.load(intent);
        setSchedulerStatus((state?.status as ExecutionStatus) ?? 'idle');
      }
      if (!successKinds.includes(result.kind)) {
        throw new Error(result.message ?? 'Task operation was not applied: ' + result.kind + '. Refresh the execution state before trying again.');
      }
    },
    [activeIntent, appContainer, refreshTasks, setSchedulerStatus],
  );

  const retryTask = useCallback(
    (taskId: string, intentName?: string) =>
      mutateTask(s => appContainer.taskOperationsUseCase.retryTask(s, taskId), ['retried'], intentName),
    [mutateTask, appContainer],
  );
  const retryAllFailed = useCallback(
    (intentName?: string) =>
      mutateTask(s => appContainer.taskOperationsUseCase.retryIntent(s), ['retried'], intentName),
    [mutateTask, appContainer],
  );
  const completeTask = useCallback(
    (taskId: string, intentName?: string) =>
      mutateTask(s => appContainer.taskOperationsUseCase.markTaskCompleted(s, taskId), ['completed'], intentName),
    [mutateTask, appContainer],
  );
  const resetTask = useCallback(
    (taskId: string, intentName?: string) =>
      mutateTask(s => appContainer.taskOperationsUseCase.resetTask(s, taskId), ['reset-single'], intentName),
    [mutateTask, appContainer],
  );
  const resetAllTasks = useCallback(
    (intentName?: string) =>
      mutateTask(s => appContainer.taskOperationsUseCase.resetTasks(s), ['reset-all'], intentName),
    [mutateTask, appContainer],
  );

  return { retryTask, retryAllFailed, completeTask, resetTask, resetAllTasks };
}
