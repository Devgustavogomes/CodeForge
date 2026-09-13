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
  initialSpec?: string;
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

  const [specs, setSpecs] = useState<string[]>([]);
  const [selectedSpecIndex, setSelectedSpecIndex] = useState(0);
  const [specSearchQuery, setSpecSearchQuery] = useState('');
  const [isSearchingSpec, setIsSearchingSpec] = useState(false);

  useEffect(() => {
    const specList = container.listSpecsUseCase.listNames();
    setSpecs(specList);
    const active = options?.initialSpec || exec?.activeSpec;
    if (active) {
      const idx = specList.indexOf(active);
      if (idx >= 0) setSelectedSpecIndex(idx);
    }
  }, [container, options?.initialSpec, exec?.activeSpec]);

  const filteredSpecs = useMemo(() => {
    if (!specSearchQuery.trim()) return specs;
    const q = specSearchQuery.toLowerCase();
    return specs.filter((s) => s.toLowerCase().includes(q));
  }, [specs, specSearchQuery]);

  // Adjust selectedSpecIndex if bounds exceed filteredSpecs
  useEffect(() => {
    if (filteredSpecs.length > 0 && selectedSpecIndex >= filteredSpecs.length) {
      setSelectedSpecIndex(0);
    }
  }, [filteredSpecs.length, selectedSpecIndex]);

  const currentSpec =
    filteredSpecs[selectedSpecIndex] ||
    options?.initialSpec ||
    exec?.activeSpec ||
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

  const loadTasksForSpec = useCallback(
    (spec: string, resetSelection = true): TaskScreenItem[] => {
      if (!spec) {
        setTasks([]);
        setSelectedTaskIndex(0);
        return [];
      }
      const loaded = loadTasksFromDisk(container.gw, container.stateRepo, spec);
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
    loadTasksForSpec(currentSpec);
  }, [currentSpec, options?.initialTasks, loadTasksForSpec]);

  const selectedTask = tasks[selectedTaskIndex] ?? null;

  const handleComplete = useCallback(async () => {
    if (!selectedTask || !currentSpec) return;
    try {
      if (options?.onCompleteTask) {
        options.onCompleteTask(selectedTask.id);
      }

      const result = container.taskOperationsUseCase.markTaskCompleted(
        currentSpec,
        selectedTask.id,
      );

      if (result.kind === 'not-found') {
        if (!options?.initialTasks) {
          setFeedback({
            type: 'error',
            message: `Task ${selectedTask.id} not found in spec ${currentSpec}.`,
          });
          return;
        }
      }

      if (exec?.activeSpec === currentSpec) {
        if (exec.refreshTasks) {
          exec.refreshTasks(currentSpec);
        } else if (exec.completeTask) {
          await exec.completeTask(selectedTask.id, currentSpec);
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
  }, [selectedTask, currentSpec, options, exec, container]);

  const handleReset = useCallback(async () => {
    if (!selectedTask || !currentSpec) return;
    try {
      if (options?.onResetTask) {
        options.onResetTask(selectedTask.id);
      }

      const result = container.taskOperationsUseCase.resetTasks(
        currentSpec,
        selectedTask.id,
      );

      if (result.kind !== 'reset-single' && result.kind !== 'reset-all') {
        if (!options?.initialTasks) {
          const msg =
            result.kind === 'spec-not-found'
              ? `Spec ${currentSpec} not found.`
              : result.kind === 'task-not-found'
              ? `Task ${selectedTask.id} not found in spec ${currentSpec}.`
              : `No execution state found for spec ${currentSpec}.`;
          setFeedback({
            type: 'error',
            message: msg,
          });
          return;
        }
      }

      if (exec?.activeSpec === currentSpec) {
        if (exec.refreshTasks) {
          exec.refreshTasks(currentSpec);
        } else if (exec.resetTask) {
          await exec.resetTask(selectedTask.id, currentSpec);
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
  }, [selectedTask, currentSpec, options, exec, container]);

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

  const handleNextSpec = useCallback(() => {
    if (filteredSpecs.length > 0) {
      setSelectedSpecIndex((prev) => (prev + 1) % filteredSpecs.length);
      setFeedback(null);
    }
  }, [filteredSpecs.length]);

  const handlePrevSpec = useCallback(() => {
    if (filteredSpecs.length > 0) {
      setSelectedSpecIndex((prev) => (prev - 1 + filteredSpecs.length) % filteredSpecs.length);
      setFeedback(null);
    }
  }, [filteredSpecs.length]);

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
    if (!selectedTask || !currentSpec) return;
    isDeleteConfirmingRef.current = false;
    setFeedback(null);
    setIsDeleteTaskModalOpen(true);
  }, [currentSpec, selectedTask]);

  const handleCancelDeleteTask = useCallback(() => {
    isDeleteConfirmingRef.current = false;
    setIsDeleteTaskModalOpen(false);
  }, []);

  const handleConfirmDeleteTask = useCallback(() => {
    if (
      !selectedTask ||
      !currentSpec ||
      !isDeleteTaskModalOpen ||
      isDeleteConfirmingRef.current
    ) {
      return;
    }

    isDeleteConfirmingRef.current = true;
    const taskId = selectedTask.id;
    const specName = currentSpec;
    setIsDeleteTaskModalOpen(false);

    let result: ReturnType<typeof container.deleteTaskUseCase.execute>;
    try {
      result = container.deleteTaskUseCase.execute(specName, taskId);
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
        loadTasksForSpec(specName, false);
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
      case 'spec-not-found':
        publishDeleteFeedback({
          type: 'error',
          message: translate('tui_task_delete_spec_not_found', language, {
            spec: specName,
          }),
        });
        return;
      case 'task-not-found':
        publishDeleteFeedback({
          type: 'error',
          message: translate('tui_task_delete_not_found', language, {
            taskId,
            spec: specName,
          }),
        });
        return;
    }
  }, [
    container,
    currentSpec,
    isDeleteTaskModalOpen,
    language,
    loadTasksForSpec,
    publishDeleteFeedback,
    selectedTask,
  ]);

  const handleStartSearchSpec = useCallback(() => {
    setIsSearchingSpec(true);
    nav?.setTextInputActive(true);
  }, [nav]);

  const handleStopSearchSpec = useCallback(() => {
    setIsSearchingSpec(false);
    nav?.setTextInputActive(false);
  }, [nav]);

  const handleClearSearchSpec = useCallback(() => {
    setSpecSearchQuery('');
    setIsSearchingSpec(false);
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
    specs: filteredSpecs,
    rawSpecs: specs,
    selectedSpecIndex,
    currentSpec,
    specSearchQuery,
    setSpecSearchQuery,
    isSearchingSpec,
    handleStartSearchSpec,
    handleStopSearchSpec,
    handleClearSearchSpec,
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
    handleNextSpec,
    handlePrevSpec,
    handleToggleViewJson,
    handleToggleExpand,
    setFeedback,
  };
}
