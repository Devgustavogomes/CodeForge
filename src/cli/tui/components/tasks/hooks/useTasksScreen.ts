import { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { ExecutionContext } from '../../../context/ExecutionContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { loadTasksFromDisk } from '../../../context/ExecutionContext/taskLoader.js';
import { TaskScreenItem } from '../components/TaskTree.js';
import { SupportedLanguage } from '../../../../../config/types.js';
import { translate } from '../../../../ui/i18n.js';

export interface TasksActionFeedback {
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface UseTasksScreenOptions {
  container?: AppContainer;
  initialIntent?: string;
  initialTasks?: TaskScreenItem[];
  onCompleteTask?: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
  onFeedback?: (feedback: TasksActionFeedback) => void;
  onNotification?: (
    message: string,
    type?: 'success' | 'error' | 'info',
  ) => void;
  language?: SupportedLanguage;
}

export function useTasksScreen(options?: UseTasksScreenOptions) {
  const nav = useContext(NavigationContext);
  const contextContainer = useContext(ContainerContext);
  const container = useMemo(
    () => options?.container ?? contextContainer ?? createAppContainer(),
    [options?.container, contextContainer],
  );

  const exec = useContext(ExecutionContext);

  const language: SupportedLanguage = useMemo(() => {
    if (options?.language) return options.language;
    try {
      return container.configService?.loadConfig?.()?.language ?? 'en';
    } catch {
      return 'en';
    }
  }, [container, options?.language]);

  const [intents, setIntents] = useState<string[]>([]);
  const [selectedIntentIndex, setSelectedIntentIndex] = useState(0);
  const [intentSearchQuery, setIntentSearchQuery] = useState('');
  const [isSearchingIntent, setIsSearchingIntent] = useState(false);

  useEffect(() => {
    const intentList = container.listIntentsUseCase.listNames();
    setIntents(intentList);
    const active = options?.initialIntent || exec?.activeIntent;
    if (active) {
      const idx = intentList.indexOf(active);
      if (idx >= 0) setSelectedIntentIndex(idx);
    }
  }, [container, options?.initialIntent, exec?.activeIntent]);

  const filteredIntents = useMemo(() => {
    if (!intentSearchQuery.trim()) return intents;
    const q = intentSearchQuery.toLowerCase();
    return intents.filter((s) => s.toLowerCase().includes(q));
  }, [intents, intentSearchQuery]);

  // Adjust selectedIntentIndex if bounds exceed filteredIntents
  useEffect(() => {
    if (filteredIntents.length > 0 && selectedIntentIndex >= filteredIntents.length) {
      setSelectedIntentIndex(0);
    }
  }, [filteredIntents.length, selectedIntentIndex]);

  const currentIntent =
    filteredIntents[selectedIntentIndex] ||
    options?.initialIntent ||
    exec?.activeIntent ||
    '';

  const [tasks, setTasks] = useState<TaskScreenItem[]>(
    () => options?.initialTasks ?? [],
  );
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [viewJson, setViewJson] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isViewTaskModalOpen, setIsViewTaskModalOpen] = useState(false);
  const [isDeleteTaskModalOpen, setIsDeleteTaskModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<TasksActionFeedback | null>(null);
  const isDeleteConfirmingRef = useRef(false);

  const loadTasksForIntent = useCallback(
    (intent: string, resetSelection = true): TaskScreenItem[] => {
      if (!intent) {
        setTasks([]);
        setSelectedTaskIndex(0);
        return [];
      }
      const loaded = loadTasksFromDisk(container.gw, container.stateRepo, intent);
      loaded.sort((a, b) => a.id.localeCompare(b.id));
      setTasks(loaded);
      setSelectedTaskIndex((currentIndex) =>
        resetSelection
          ? 0
          : Math.min(currentIndex, Math.max(0, loaded.length - 1)),
      );
      return loaded;
    },
    [container],
  );

  useEffect(() => {
    if (options?.initialTasks) return;
    loadTasksForIntent(currentIntent);
  }, [currentIntent, options?.initialTasks, loadTasksForIntent]);

  const selectedTask = tasks[selectedTaskIndex] ?? null;

  const handleComplete = useCallback(async () => {
    if (!selectedTask || !currentIntent) return;
    try {
      if (options?.onCompleteTask) {
        options.onCompleteTask(selectedTask.id);
      }

      const result = container.taskOperationsUseCase.markTaskCompleted(
        currentIntent,
        selectedTask.id,
      );

      if (result.kind === 'not-found') {
        if (!options?.initialTasks) {
          setFeedback({
            type: 'error',
            message: `Task ${selectedTask.id} not found in intent ${currentIntent}.`,
          });
          return;
        }
      }

      if (exec?.activeIntent === currentIntent) {
        if (exec.refreshTasks) {
          exec.refreshTasks(currentIntent);
        } else if (exec.completeTask) {
          await exec.completeTask(selectedTask.id, currentIntent);
        }
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === selectedTask.id
            ? { ...t, status: 'completed', errors: undefined }
            : t,
        ),
      );
      setFeedback({
        type: 'success',
        message: `Task ${selectedTask.id} marked as completed.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({
        type: 'error',
        message: `Failed to complete task: ${msg}`,
      });
    }
  }, [selectedTask, currentIntent, options, exec, container]);

  const handleReset = useCallback(async () => {
    if (!selectedTask || !currentIntent) return;
    try {
      if (options?.onResetTask) {
        options.onResetTask(selectedTask.id);
      }

      const result = container.taskOperationsUseCase.resetTasks(
        currentIntent,
        selectedTask.id,
      );

      if (result.kind !== 'reset-single' && result.kind !== 'reset-all') {
        if (!options?.initialTasks) {
          const msg =
            result.kind === 'intent-not-found'
              ? `Intent ${currentIntent} not found.`
              : result.kind === 'task-not-found'
              ? `Task ${selectedTask.id} not found in intent ${currentIntent}.`
              : `No execution state found for intent ${currentIntent}.`;
          setFeedback({
            type: 'error',
            message: msg,
          });
          return;
        }
      }

      if (exec?.activeIntent === currentIntent) {
        if (exec.refreshTasks) {
          exec.refreshTasks(currentIntent);
        } else if (exec.resetTask) {
          await exec.resetTask(selectedTask.id, currentIntent);
        }
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === selectedTask.id
            ? { ...t, status: 'pending', errors: undefined }
            : t,
        ),
      );
      setFeedback({
        type: 'success',
        message: `Task ${selectedTask.id} reset to pending.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: 'error', message: `Failed to reset task: ${msg}` });
    }
  }, [selectedTask, currentIntent, options, exec, container]);

  const handleNextTask = useCallback(() => {
    setSelectedTaskIndex((prev) =>
      prev < tasks.length - 1 ? prev + 1 : 0,
    );
    setFeedback(null);
  }, [tasks.length]);

  const handlePrevTask = useCallback(() => {
    setSelectedTaskIndex((prev) =>
      prev > 0 ? prev - 1 : Math.max(0, tasks.length - 1),
    );
    setFeedback(null);
  }, [tasks.length]);

  const handleNextIntent = useCallback(() => {
    if (filteredIntents.length > 0) {
      setSelectedIntentIndex((prev) => (prev + 1) % filteredIntents.length);
      setFeedback(null);
    }
  }, [filteredIntents.length]);

  const handlePrevIntent = useCallback(() => {
    if (filteredIntents.length > 0) {
      setSelectedIntentIndex((prev) => (prev - 1 + filteredIntents.length) % filteredIntents.length);
      setFeedback(null);
    }
  }, [filteredIntents.length]);

  const handleToggleViewJson = useCallback(() => {
    setViewJson((prev) => !prev);
  }, []);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleOpenViewTaskModal = useCallback(() => {
    if (selectedTask) {
      setIsViewTaskModalOpen(true);
    }
  }, [selectedTask]);

  const handleCloseViewTaskModal = useCallback(() => {
    setIsViewTaskModalOpen(false);
  }, []);

  const publishDeleteFeedback = useCallback(
    (nextFeedback: TasksActionFeedback) => {
      setFeedback(nextFeedback);
      options?.onFeedback?.(nextFeedback);
      options?.onNotification?.(nextFeedback.message, nextFeedback.type);
    },
    [options?.onFeedback, options?.onNotification],
  );

  const handleOpenDeleteTaskModal = useCallback(() => {
    if (!selectedTask || !currentIntent) return;
    isDeleteConfirmingRef.current = false;
    setFeedback(null);
    setIsDeleteTaskModalOpen(true);
  }, [currentIntent, selectedTask]);

  const handleCancelDeleteTask = useCallback(() => {
    isDeleteConfirmingRef.current = false;
    setIsDeleteTaskModalOpen(false);
  }, []);

  const handleConfirmDeleteTask = useCallback(() => {
    if (
      !selectedTask ||
      !currentIntent ||
      !isDeleteTaskModalOpen ||
      isDeleteConfirmingRef.current
    ) {
      return;
    }

    isDeleteConfirmingRef.current = true;
    const taskId = selectedTask.id;
    const intentName = currentIntent;
    setIsDeleteTaskModalOpen(false);

    let result: ReturnType<typeof container.deleteTaskUseCase.execute>;
    try {
      result = container.deleteTaskUseCase.execute(intentName, taskId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      publishDeleteFeedback({
        type: 'error',
        message: translate('tui_task_delete_error', language, {
          taskId,
          error: message,
        }),
      });
      return;
    }

    switch (result.kind) {
      case 'deleted':
        loadTasksForIntent(intentName, false);
        publishDeleteFeedback({
          type: 'success',
          message: translate('tui_task_delete_success', language, {
            taskId: result.taskId,
            count: result.cleanedDependenciesCount,
          }),
        });
        return;
      case 'not-initialized':
        publishDeleteFeedback({
          type: 'error',
          message: translate('tui_delete_not_initialized', language),
        });
        return;
      case 'intent-not-found':
        publishDeleteFeedback({
          type: 'error',
          message: translate('tui_task_delete_intent_not_found', language, {
            intent: intentName,
          }),
        });
        return;
      case 'task-not-found':
        publishDeleteFeedback({
          type: 'error',
          message: translate('tui_task_delete_not_found', language, {
            taskId,
            intent: intentName,
          }),
        });
        return;
    }
  }, [
    container,
    currentIntent,
    isDeleteTaskModalOpen,
    language,
    loadTasksForIntent,
    publishDeleteFeedback,
    selectedTask,
  ]);

  const handleStartSearchIntent = useCallback(() => {
    setIsSearchingIntent(true);
    nav?.setTextInputActive(true);
  }, [nav]);

  const handleStopSearchIntent = useCallback(() => {
    setIsSearchingIntent(false);
    nav?.setTextInputActive(false);
  }, [nav]);

  const handleClearSearchIntent = useCallback(() => {
    setIntentSearchQuery('');
    setIsSearchingIntent(false);
    nav?.setTextInputActive(false);
  }, [nav]);

  const maxVisibleTasks = 6;
  const visibleTasks = useMemo(() => {
    if (tasks.length <= maxVisibleTasks) return tasks;
    const selectedIdx = Math.max(0, selectedTaskIndex);
    let start = Math.max(0, selectedIdx - Math.floor(maxVisibleTasks / 2));
    if (start + maxVisibleTasks > tasks.length) {
      start = Math.max(0, tasks.length - maxVisibleTasks);
    }
    return tasks.slice(start, start + maxVisibleTasks);
  }, [tasks, maxVisibleTasks, selectedTaskIndex]);

  return {
    intents: filteredIntents,
    rawIntents: intents,
    selectedIntentIndex,
    currentIntent,
    intentSearchQuery,
    setIntentSearchQuery,
    isSearchingIntent,
    handleStartSearchIntent,
    handleStopSearchIntent,
    handleClearSearchIntent,
    tasks,
    visibleTasks,
    selectedTaskIndex,
    selectedTask,
    viewJson,
    isExpanded,
    language,
    isViewTaskModalOpen,
    handleOpenViewTaskModal,
    handleCloseViewTaskModal,
    isDeleteTaskModalOpen,
    handleOpenDeleteTaskModal,
    handleCancelDeleteTask,
    handleConfirmDeleteTask,
    isTextInputActive: nav?.isTextInputActive ?? false,
    feedback,
    handleComplete,
    handleReset,
    handleNextTask,
    handlePrevTask,
    handleNextIntent,
    handlePrevIntent,
    handleToggleViewJson,
    handleToggleExpand,
    setFeedback,
  };
}
