import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { ExecutionContext } from '../../../context/ExecutionContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { loadTasksFromDisk } from '../../../context/ExecutionContext/taskLoader.js';
import { TaskScreenItem } from '../components/TaskTree.js';

export interface UseTasksScreenOptions {
  container?: AppContainer;
  initialSpec?: string;
  initialTasks?: TaskScreenItem[];
  onCompleteTask?: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
}

export function useTasksScreen(options?: UseTasksScreenOptions) {
  const nav = useContext(NavigationContext);
  const contextContainer = useContext(ContainerContext);
  const container = useMemo(
    () => options?.container ?? contextContainer ?? createAppContainer(),
    [options?.container, contextContainer],
  );

  const exec = useContext(ExecutionContext);

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
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const loadTasksForSpec = useCallback(
    (spec: string) => {
      if (!spec) {
        setTasks([]);
        return;
      }
      const loaded = loadTasksFromDisk(container.gw, container.stateRepo, spec);
      loaded.sort((a, b) => a.id.localeCompare(b.id));
      setTasks(loaded);
      setSelectedTaskIndex(0);
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
