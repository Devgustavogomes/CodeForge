import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  ReactiveTaskScheduler,
  SchedulerStatus,
  TaskLogEvent,
  RunStartedEvent,
  RunCompletedEvent,
  RunFailedEvent,
  RunDeadlockEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
} from "../../../scheduler/ReactiveTaskScheduler.js";
import { TaskStatus } from "../../../domain/execution.js";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";

export type ExecutionStatus = SchedulerStatus;

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  dependencies: string[];
  startedAt?: string;
  completedAt?: string;
  errors?: string[];
  objective?: string;
  files?: string[];
  context?: string;
  constraints?: string[];
  acceptanceCriteria?: string[];
}

export interface ExecutionContextValue {
  activeSpec: string | null;
  tasks: TaskItem[];
  selectedTaskId: string | null;
  selectedTask: TaskItem | null;
  status: ExecutionStatus;
  schedulerStatus: ExecutionStatus;
  logs: Record<string, string[]>;
  getTaskLogs: (taskId: string) => string[];
  setSelectedTaskId: (taskId: string | null) => void;
  selectTask: (taskId: string | null) => void;
  setActiveSpec: (specName: string) => void;
  startRun: (specName?: string) => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  retryAllFailed: () => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  resetTask: (taskId: string) => Promise<void>;
  clearLogs: (taskId?: string) => void;
  scheduler: ReactiveTaskScheduler | null;
}

export interface ExecutionProviderProps {
  children: React.ReactNode;
  scheduler?: ReactiveTaskScheduler;
  container?: AppContainer;
  initialSpec?: string;
  maxLogLines?: number;
}

const DEFAULT_MAX_LOG_LINES = 1000;
const MAX_LINE_CHARS = 5000;

function loadTaskItems(
  scheduler: ReactiveTaskScheduler | null,
  spec: string,
): TaskItem[] {
  if (!scheduler) return [];
  const state = scheduler.getState(spec);
  const taskDefs = scheduler.getTasks(spec);
  const seen = new Set<string>();

  const items: TaskItem[] = [];

  for (const def of taskDefs) {
    seen.add(def.id);
    const taskState = state?.tasks[def.id];
    items.push({
      id: def.id,
      title: def.title || def.id,
      status: taskState?.status ?? "pending",
      dependencies: def.dependencies || [],
      startedAt: taskState?.startedAt,
      completedAt: taskState?.completedAt,
      errors: taskState?.errors,
      objective: def.objective,
      files: def.files,
      context: def.context,
      constraints: def.constraints,
      acceptanceCriteria: def.acceptanceCriteria,
    });
  }

  if (state?.tasks) {
    for (const [id, taskState] of Object.entries(state.tasks)) {
      if (!seen.has(id)) {
        items.push({
          id,
          title: taskState.title || id,
          status: taskState.status,
          dependencies: taskState.dependencies || [],
          startedAt: taskState.startedAt,
          completedAt: taskState.completedAt,
          errors: taskState.errors,
        });
      }
    }
  }

  return items;
}

export const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export const ExecutionProvider: React.FC<ExecutionProviderProps> = ({
  children,
  scheduler: propScheduler,
  container,
  initialSpec,
  maxLogLines = DEFAULT_MAX_LOG_LINES,
}) => {
  const scheduler = useMemo(() => {
    if (propScheduler) return propScheduler;
    const appContainer = container ?? createAppContainer();
    const config = appContainer.configService.loadConfig() ?? {
      environment: "antigravity",
      plannerAgent: "default",
      executorAgent: "default",
      language: "en",
    };
    const runner = appContainer.runnerProvider(config.environment);
    return new ReactiveTaskScheduler(
      appContainer.workspaceGateway,
      runner,
      config,
      appContainer.executionStateRepository,
      appContainer.promptService,
    );
  }, [propScheduler, container]);

  const [activeSpec, setActiveSpecState] = useState<string | null>(
    initialSpec ?? null,
  );
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    if (!initialSpec || !scheduler) return [];
    return loadTaskItems(scheduler, initialSpec);
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => {
    if (!initialSpec || !scheduler) return null;
    const initialTasks = loadTaskItems(scheduler, initialSpec);
    return initialTasks[0]?.id ?? null;
  });
  const [schedulerStatus, setSchedulerStatus] = useState<ExecutionStatus>(() => {
    if (!scheduler) return "idle";
    if (initialSpec) {
      const state = scheduler.getState(initialSpec);
      if (state) return state.status as ExecutionStatus;
    }
    return scheduler.getStatus();
  });
  const [logs, setLogs] = useState<Record<string, string[]>>({});

  const refreshTasks = useCallback(
    (spec: string) => {
      if (!scheduler) return;
      const items = loadTaskItems(scheduler, spec);
      setTasks(items);

      setSelectedTaskId((prev) => {
        if (prev && items.some((t) => t.id === prev)) {
          return prev;
        }
        return items[0]?.id ?? null;
      });
    },
    [scheduler],
  );

  const setActiveSpec = useCallback(
    (specName: string) => {
      setActiveSpecState(specName);
      refreshTasks(specName);
      if (scheduler) {
        const state = scheduler.getState(specName);
        if (state) {
          setSchedulerStatus(state.status as ExecutionStatus);
        }
      }
    },
    [scheduler, refreshTasks],
  );

  useEffect(() => {
    if (initialSpec) {
      setActiveSpec(initialSpec);
    }
  }, [initialSpec, setActiveSpec]);

  const appendLog = useCallback(
    (taskId: string, chunk: string) => {
      if (!chunk) return;
      setLogs((prev) => {
        const existing = prev[taskId] || [];
        const lines = chunk
          .split(/\r?\n/)
          .map((l) =>
            l.length > MAX_LINE_CHARS
              ? l.slice(0, MAX_LINE_CHARS) + "..."
              : l,
          );

        if (lines.length > 1 && lines[lines.length - 1] === "") {
          lines.pop();
        }

        const combined = [...existing, ...lines];
        const bounded =
          combined.length > maxLogLines
            ? combined.slice(combined.length - maxLogLines)
            : combined;

        return {
          ...prev,
          [taskId]: bounded,
        };
      });
    },
    [maxLogLines],
  );

  useEffect(() => {
    if (!scheduler) return;

    const onRunStarted = (event: RunStartedEvent) => {
      setSchedulerStatus("running");
      if (event.specName) {
        refreshTasks(event.specName);
      }
    };

    const onRunCompleted = (event: RunCompletedEvent) => {
      setSchedulerStatus("completed");
      if (event.specName) {
        refreshTasks(event.specName);
      }
    };

    const onRunFailed = (event: RunFailedEvent) => {
      setSchedulerStatus("failed");
      if (event.specName) {
        refreshTasks(event.specName);
      }
    };

    const onRunDeadlock = (event: RunDeadlockEvent) => {
      setSchedulerStatus("deadlock");
      if (event.specName) {
        refreshTasks(event.specName);
      }
    };

    const onTaskStarted = (event: TaskStartedEvent) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === event.taskId
            ? { ...t, status: "running", startedAt: new Date().toISOString() }
            : t,
        ),
      );
    };

    const onTaskCompleted = (event: TaskCompletedEvent) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === event.taskId
            ? {
                ...t,
                status: "completed",
                completedAt: new Date().toISOString(),
                errors: undefined,
              }
            : t,
        ),
      );
    };

    const onTaskFailed = (event: TaskFailedEvent) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === event.taskId
            ? {
                ...t,
                status: "failed",
                completedAt: new Date().toISOString(),
                errors: event.errors,
              }
            : t,
        ),
      );
    };

    const onTaskLog = (
      eventOrTaskId: TaskLogEvent | string,
      maybeChunk?: unknown,
    ) => {
      if (typeof eventOrTaskId === "string") {
        appendLog(eventOrTaskId, typeof maybeChunk === "string" ? maybeChunk : "");
      } else if (eventOrTaskId && typeof eventOrTaskId === "object") {
        appendLog(
          eventOrTaskId.taskId,
          eventOrTaskId.chunk || (typeof maybeChunk === "string" ? maybeChunk : ""),
        );
      }
    };

    scheduler.on("run:started", onRunStarted);
    scheduler.on("run:completed", onRunCompleted);
    scheduler.on("run:failed", onRunFailed);
    scheduler.on("run:deadlock", onRunDeadlock);
    scheduler.on("task:started", onTaskStarted);
    scheduler.on("task:completed", onTaskCompleted);
    scheduler.on("task:failed", onTaskFailed);
    scheduler.on("task:log", onTaskLog);

    return () => {
      scheduler.off("run:started", onRunStarted);
      scheduler.off("run:completed", onRunCompleted);
      scheduler.off("run:failed", onRunFailed);
      scheduler.off("run:deadlock", onRunDeadlock);
      scheduler.off("task:started", onTaskStarted);
      scheduler.off("task:completed", onTaskCompleted);
      scheduler.off("task:failed", onTaskFailed);
      scheduler.off("task:log", onTaskLog);
    };
  }, [scheduler, appendLog, refreshTasks]);

  const startRun = useCallback(
    async (specName?: string): Promise<void> => {
      const spec = specName || activeSpec;
      if (!spec || !scheduler) return;

      if (spec !== activeSpec) {
        setActiveSpec(spec);
      }
      setSchedulerStatus("running");
      try {
        await scheduler.run(spec);
      } finally {
        refreshTasks(spec);
        setSchedulerStatus(scheduler.getStatus());
      }
    },
    [activeSpec, scheduler, setActiveSpec, refreshTasks],
  );

  const retryTask = useCallback(
    async (taskId: string): Promise<void> => {
      if (!scheduler) return;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "pending", errors: undefined } : t,
        ),
      );
      setSchedulerStatus("running");
      await scheduler.retryTask(taskId, activeSpec || undefined);
      if (activeSpec) {
        refreshTasks(activeSpec);
      }
      setSchedulerStatus(scheduler.getStatus());
    },
    [activeSpec, scheduler, refreshTasks],
  );

  const retryAllFailed = useCallback(async (): Promise<void> => {
    if (!scheduler) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.status === "failed"
          ? { ...t, status: "pending", errors: undefined }
          : t,
      ),
    );
    setSchedulerStatus("running");
    await scheduler.retryAllFailed(activeSpec || undefined);
    if (activeSpec) {
      refreshTasks(activeSpec);
    }
    setSchedulerStatus(scheduler.getStatus());
  }, [activeSpec, scheduler, refreshTasks]);

  const completeTask = useCallback(
    async (taskId: string): Promise<void> => {
      if (!scheduler) return;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: "completed", errors: undefined }
            : t,
        ),
      );
      await scheduler.completeTask(taskId, activeSpec || undefined);
      if (activeSpec) {
        refreshTasks(activeSpec);
      }
      setSchedulerStatus(scheduler.getStatus());
    },
    [activeSpec, scheduler, refreshTasks],
  );

  const resetTask = useCallback(
    async (taskId: string): Promise<void> => {
      if (!scheduler) return;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "pending", errors: undefined } : t,
        ),
      );
      await scheduler.resetTask(taskId, activeSpec || undefined);
      if (activeSpec) {
        refreshTasks(activeSpec);
      }
      setSchedulerStatus(scheduler.getStatus());
    },
    [activeSpec, scheduler, refreshTasks],
  );

  const getTaskLogs = useCallback(
    (taskId: string): string[] => {
      return logs[taskId] || [];
    },
    [logs],
  );

  const clearLogs = useCallback((taskId?: string) => {
    if (taskId) {
      setLogs((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    } else {
      setLogs({});
    }
  }, []);

  const selectTask = useCallback((taskId: string | null) => {
    setSelectedTaskId(taskId);
  }, []);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find((t) => t.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  const value: ExecutionContextValue = useMemo(
    () => ({
      activeSpec,
      tasks,
      selectedTaskId,
      selectedTask,
      status: schedulerStatus,
      schedulerStatus,
      logs,
      getTaskLogs,
      setSelectedTaskId,
      selectTask,
      setActiveSpec,
      startRun,
      retryTask,
      retryAllFailed,
      completeTask,
      resetTask,
      clearLogs,
      scheduler,
    }),
    [
      activeSpec,
      tasks,
      selectedTaskId,
      selectedTask,
      schedulerStatus,
      logs,
      getTaskLogs,
      selectTask,
      setActiveSpec,
      startRun,
      retryTask,
      retryAllFailed,
      completeTask,
      resetTask,
      clearLogs,
      scheduler,
    ],
  );

  return (
    <ExecutionContext.Provider value={value}>
      {children}
    </ExecutionContext.Provider>
  );
};

export function useExecution(): ExecutionContextValue {
  const context = useContext(ExecutionContext);
  if (!context) {
    throw new Error("useExecution must be used within an ExecutionProvider");
  }
  return context;
}
