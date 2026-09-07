import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { ExecutionContext } from '../../../context/ExecutionContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { PATHS } from '../../../../../infrastructure/paths.js';
import { Task } from '../../../../../domain/task.js';
import { TaskScreenItem } from '../components/TaskTree.js';

export interface UseTasksScreenOptions {
  container?: AppContainer;
  initialSpec?: string;
  initialTasks?: TaskScreenItem[];
  onCompleteTask?: (taskId: string) => void;
  onRetryTask?: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
}

export function useTasksScreen(options?: UseTasksScreenOptions) {
  const contextContainer = useContext(ContainerContext);
  const container = useMemo(
    () => options?.container ?? contextContainer ?? createAppContainer(),
    [options?.container, contextContainer],
  );

  const exec = useContext(ExecutionContext);

  const [specs, setSpecs] = useState<string[]>([]);
  const [selectedSpecIndex, setSelectedSpecIndex] = useState(0);

  useEffect(() => {
    try {
      const specList = container.listSpecsUseCase.listNames();
      setSpecs(specList);
      const active = options?.initialSpec || exec?.activeSpec;
      if (active) {
        const idx = specList.indexOf(active);
        if (idx >= 0) setSelectedSpecIndex(idx);
      }
    } catch {
      // ignore
    }
  }, [container, options?.initialSpec, exec?.activeSpec]);

  const currentSpec =
    specs[selectedSpecIndex] ||
    options?.initialSpec ||
    exec?.activeSpec ||
    '';

  const [tasks, setTasks] = useState<TaskScreenItem[]>(
    () => options?.initialTasks ?? [],
  );
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [viewJson, setViewJson] = useState(false);
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
      try {
        const tasksDir = `${PATHS.tasksDir}/${spec}`;
        if (!container.gw.exists(tasksDir)) {
          setTasks([]);
          return;
        }

        const taskFiles = container.gw
          .listDir(tasksDir)
          .filter((f) => f.endsWith('.json'));
        const execState = container.stateRepo.load(spec);

        const loaded: TaskScreenItem[] = [];
        for (const file of taskFiles) {
          const id = file.replace('.json', '');
          try {
            const raw = container.gw.readFile(`${tasksDir}/${file}`);
            const parsed = JSON.parse(raw) as Task;
            const taskState = execState?.tasks[id];

            loaded.push({
              id,
              title: parsed.title || id,
              status: taskState?.status ?? 'pending',
              dependencies: parsed.dependencies || [],
              objective: parsed.objective,
              files: parsed.files,
              context: parsed.context,
              constraints: parsed.constraints,
              acceptanceCriteria: parsed.acceptanceCriteria,
              errors: taskState?.errors,
            });
          } catch {
            loaded.push({
              id,
              title: id,
              status: 'pending',
              dependencies: [],
            });
          }
        }

        loaded.sort((a, b) => a.id.localeCompare(b.id));
        setTasks(loaded);
        setSelectedTaskIndex(0);
      } catch {
        setTasks([]);
      }
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
      if (exec?.completeTask) {
        await exec.completeTask(selectedTask.id);
      } else {
        container.taskOperationsUseCase.markTaskCompleted(
          currentSpec,
          selectedTask.id,
        );
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

  const handleRetry = useCallback(async () => {
    if (!selectedTask || !currentSpec) return;
    try {
      if (options?.onRetryTask) {
        options.onRetryTask(selectedTask.id);
      }
      if (exec?.retryTask) {
        await exec.retryTask(selectedTask.id);
      } else {
        container.taskOperationsUseCase.retryTask(currentSpec, selectedTask.id);
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
        message: `Task ${selectedTask.id} reset to pending for retry.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: 'error', message: `Failed to retry task: ${msg}` });
    }
  }, [selectedTask, currentSpec, options, exec, container]);

  const handleReset = useCallback(async () => {
    if (!selectedTask || !currentSpec) return;
    try {
      if (options?.onResetTask) {
        options.onResetTask(selectedTask.id);
      }
      if (exec?.resetTask) {
        await exec.resetTask(selectedTask.id);
      } else {
        container.taskOperationsUseCase.resetTasks(
          currentSpec,
          selectedTask.id,
        );
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
    if (specs.length > 0) {
      setSelectedSpecIndex((prev) => (prev + 1) % specs.length);
      setFeedback(null);
    }
  }, [specs.length]);

  const handlePrevSpec = useCallback(() => {
    if (specs.length > 0) {
      setSelectedSpecIndex((prev) => (prev - 1 + specs.length) % specs.length);
      setFeedback(null);
    }
  }, [specs.length]);

  const handleToggleViewJson = useCallback(() => {
    setViewJson((prev) => !prev);
  }, []);

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
    specs,
    selectedSpecIndex,
    currentSpec,
    tasks,
    visibleTasks,
    selectedTaskIndex,
    selectedTask,
    viewJson,
    feedback,
    handleComplete,
    handleRetry,
    handleReset,
    handleNextTask,
    handlePrevTask,
    handleNextSpec,
    handlePrevSpec,
    handleToggleViewJson,
    setFeedback,
  };
}
