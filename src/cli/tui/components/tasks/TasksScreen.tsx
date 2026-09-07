import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { useNavigation } from "../../context/NavigationContext.js";
import { useExecution } from "../../context/ExecutionContext.js";
import { useTerminalDimensions } from "../../hooks/useTerminalDimensions.js";
import {
  AppContainer,
  createAppContainer,
} from "../../../../infrastructure/container.js";
import {
  TaskOperationsUseCase,
  TaskInfoResult,
} from "../../../../application/use-cases/TaskOperationsUseCase.js";
import { Task } from "../../../../domain/task.js";
import { TaskStatus } from "../../../../domain/execution.js";
import { PATHS } from "../../../../infrastructure/paths.js";

export interface TaskScreenItem {
  id: string;
  title: string;
  status: TaskStatus;
  dependencies: string[];
  objective?: string;
  files?: string[];
  context?: string;
  constraints?: string[];
  acceptanceCriteria?: string[];
  errors?: string[];
}

export interface TasksScreenProps {
  container?: AppContainer;
  initialSpec?: string;
  initialTasks?: TaskScreenItem[];
  onCompleteTask?: (taskId: string) => void;
  onRetryTask?: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
  isInteractive?: boolean;
}

const STATUS_ICONS: Record<
  TaskStatus,
  { icon: string; color: string; label: string }
> = {
  pending: { icon: "○", color: "gray", label: "[PENDING]" },
  running: { icon: "▶", color: "yellow", label: "[RUNNING]" },
  completed: { icon: "✓", color: "green", label: "[COMPLETED]" },
  failed: { icon: "✗", color: "red", label: "[FAILED]" },
};

export const TasksScreen: React.FC<TasksScreenProps> = ({
  container: propContainer,
  initialSpec,
  initialTasks,
  onCompleteTask,
  onRetryTask,
  onResetTask,
  isInteractive = true,
}) => {
  let nav: ReturnType<typeof useNavigation> | undefined;
  try {
    nav = useNavigation();
  } catch {
    // Graceful fallback outside NavigationProvider
  }

  let exec: ReturnType<typeof useExecution> | undefined;
  try {
    exec = useExecution();
  } catch {
    // Graceful fallback outside ExecutionProvider
  }

  const { breakpoint } = useTerminalDimensions();
  const container = useMemo(
    () => propContainer ?? createAppContainer(),
    [propContainer],
  );

  // Available specs
  const [specs, setSpecs] = useState<string[]>([]);
  const [selectedSpecIndex, setSelectedSpecIndex] = useState(0);

  // Load available specs
  useEffect(() => {
    try {
      const specList = container.listSpecsUseCase.listNames();
      setSpecs(specList);
      const active = initialSpec || nav?.activeSpec || exec?.activeSpec;
      if (active) {
        const idx = specList.indexOf(active);
        if (idx >= 0) setSelectedSpecIndex(idx);
      }
    } catch {
      // ignore
    }
  }, [container, initialSpec, nav?.activeSpec, exec?.activeSpec]);

  const currentSpec =
    specs[selectedSpecIndex] ||
    initialSpec ||
    nav?.activeSpec ||
    exec?.activeSpec ||
    "";

  const [tasks, setTasks] = useState<TaskScreenItem[]>(
    () => initialTasks ?? [],
  );
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [viewJson, setViewJson] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
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
          .filter((f) => f.endsWith(".json"));
        const execState = container.stateRepo.load(spec);

        const loaded: TaskScreenItem[] = [];
        for (const file of taskFiles) {
          const id = file.replace(".json", "");
          try {
            const raw = container.gw.readFile(`${tasksDir}/${file}`);
            const parsed = JSON.parse(raw) as Task;
            const taskState = execState?.tasks[id];

            loaded.push({
              id,
              title: parsed.title || id,
              status: taskState?.status ?? "pending",
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
              status: "pending",
              dependencies: [],
            });
          }
        }

        // Sort by ID
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
    if (initialTasks) return;
    loadTasksForSpec(currentSpec);
  }, [currentSpec, initialTasks, loadTasksForSpec]);

  const selectedTask = tasks[selectedTaskIndex] ?? null;

  // Complete action
  const handleComplete = useCallback(async () => {
    if (!selectedTask || !currentSpec) return;
    try {
      if (onCompleteTask) {
        onCompleteTask(selectedTask.id);
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
            ? { ...t, status: "completed", errors: undefined }
            : t,
        ),
      );
      setFeedback({
        type: "success",
        message: `Task ${selectedTask.id} marked as completed.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({
        type: "error",
        message: `Failed to complete task: ${msg}`,
      });
    }
  }, [selectedTask, currentSpec, onCompleteTask, exec, container]);

  // Retry action
  const handleRetry = useCallback(async () => {
    if (!selectedTask || !currentSpec) return;
    try {
      if (onRetryTask) {
        onRetryTask(selectedTask.id);
      }
      if (exec?.retryTask) {
        await exec.retryTask(selectedTask.id);
      } else {
        container.taskOperationsUseCase.retryTask(currentSpec, selectedTask.id);
      }
      setTasks((prev) =>
        prev.map((t) =>
          t.id === selectedTask.id
            ? { ...t, status: "pending", errors: undefined }
            : t,
        ),
      );
      setFeedback({
        type: "success",
        message: `Task ${selectedTask.id} reset to pending for retry.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Failed to retry task: ${msg}` });
    }
  }, [selectedTask, currentSpec, onRetryTask, exec, container]);

  // Reset action
  const handleReset = useCallback(async () => {
    if (!selectedTask || !currentSpec) return;
    try {
      if (onResetTask) {
        onResetTask(selectedTask.id);
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
            ? { ...t, status: "pending", errors: undefined }
            : t,
        ),
      );
      setFeedback({
        type: "success",
        message: `Task ${selectedTask.id} reset to pending.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Failed to reset task: ${msg}` });
    }
  }, [selectedTask, currentSpec, onResetTask, exec, container]);

  useInput(
    (input, key) => {
      if (!isInteractive || nav?.isTextInputActive) return;

      // Navigate tasks: Up/Down or k/j
      if (key.upArrow || input === "k") {
        setSelectedTaskIndex((prev) =>
          prev > 0 ? prev - 1 : Math.max(0, tasks.length - 1),
        );
        setFeedback(null);
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedTaskIndex((prev) =>
          prev < tasks.length - 1 ? prev + 1 : 0,
        );
        setFeedback(null);
        return;
      }

      // Switch spec filter: [ or ] or Left/Right
      if (input === "[" || key.leftArrow) {
        if (specs.length > 0) {
          const nextIdx = (selectedSpecIndex - 1 + specs.length) % specs.length;
          setSelectedSpecIndex(nextIdx);
          setFeedback(null);
        }
        return;
      }
      if (input === "]" || key.rightArrow) {
        if (specs.length > 0) {
          const nextIdx = (selectedSpecIndex + 1) % specs.length;
          setSelectedSpecIndex(nextIdx);
          setFeedback(null);
        }
        return;
      }

      // Toggle JSON view: 'v' or 'J'
      if (input === "v" || input === "J") {
        setViewJson((prev) => !prev);
        return;
      }

      // Action 'c': Complete task
      if (input === "c") {
        void handleComplete();
        return;
      }

      // Action 'r': Retry task
      if (input === "r") {
        void handleRetry();
        return;
      }

      // Action 'x': Reset task
      if (input === "x") {
        void handleReset();
        return;
      }
    },
    { isActive: isInteractive },
  );

  const isSideBySide = breakpoint !== "minimal";
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

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      {/* Main Split View */}
      <Box flexDirection={isSideBySide ? "row" : "column"} width="100%" flexGrow={1}>
        {/* Left Column: Task List */}
        <Box
          flexDirection="column"
          width={isSideBySide ? "45%" : "100%"}
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
        >
          <Box justifyContent="space-between" marginBottom={1}>
            <Box gap={1} flexShrink={1}>
              <Text bold color="yellow">
                Tasks ({tasks.length})
              </Text>
              {specs.length > 0 ? (
                <Box gap={1} flexShrink={1}>
                  {specs.length <= 3 ? (
                    specs.map((sp, idx) => {
                      const isSelected = idx === selectedSpecIndex;
                      return (
                        <Text
                          key={sp}
                          color={isSelected ? "yellow" : "gray"}
                          bold={isSelected}
                        >
                          {isSelected ? `● [${sp}]` : `○ ${sp}`}
                        </Text>
                      );
                    })
                  ) : (
                    <Box gap={1}>
                      <Text color="yellow" bold>
                        ● [{currentSpec}]
                      </Text>
                      <Text dimColor>
                        ({selectedSpecIndex + 1}/{specs.length})
                      </Text>
                    </Box>
                  )}
                </Box>
              ) : (
                <Text dimColor>• No Spec</Text>
              )}
            </Box>
            <Box flexShrink={0}>
              <Text dimColor>[←/→] Spec</Text>
            </Box>
          </Box>

          {tasks.length === 0 ? (
            <Box paddingY={2} justifyContent="center">
              <Text dimColor>No tasks found for spec "{currentSpec}".</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              {visibleTasks.map((task) => {
                const isSelected = task.id === selectedTask?.id;
                const statusInfo =
                  STATUS_ICONS[task.status] ?? STATUS_ICONS.pending;

                return (
                  <Box
                    key={task.id}
                    justifyContent="space-between"
                    width="100%"
                  >
                    <Box gap={1} flexShrink={1}>
                      <Text
                        color={isSelected ? "cyan" : undefined}
                        bold={isSelected}
                      >
                        {isSelected ? "❯" : " "}
                      </Text>
                      <Text color={statusInfo.color} bold>
                        {statusInfo.icon} {task.id}
                      </Text>
                      <Text
                        color={isSelected ? "cyan" : "white"}
                        wrap="truncate-end"
                      >
                        {task.title}
                      </Text>
                    </Box>
                    <Box flexShrink={0} paddingLeft={1}>
                      <Text color={statusInfo.color}>{statusInfo.label}</Text>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        {/* Right Column: Task Details, JSON & Actions */}
        <Box
          flexDirection="column"
          width={isSideBySide ? "55%" : "100%"}
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
        >
          <Box justifyContent="space-between" marginBottom={1}>
            <Box gap={1}>
              <Text bold color="cyan">
                Task Details: {selectedTask ? selectedTask.id : "None"}
              </Text>
              {selectedTask && (
                <Text
                  color={STATUS_ICONS[selectedTask.status]?.color ?? "gray"}
                  bold
                >
                  {STATUS_ICONS[selectedTask.status]?.label ??
                    selectedTask.status}
                </Text>
              )}
            </Box>
            <Text dimColor>[v] {viewJson ? "Formatted View" : "JSON"}</Text>
          </Box>

          {feedback && (
            <Box
              marginY={1}
              paddingX={1}
              borderStyle="single"
              borderColor={feedback.type === "success" ? "green" : "red"}
            >
              <Text color={feedback.type === "success" ? "green" : "red"} bold>
                {feedback.message}
              </Text>
            </Box>
          )}

          {selectedTask ? (
            viewJson ? (
              <Box flexDirection="column">
                <Text color="gray">
                  {JSON.stringify(selectedTask, null, 2)}
                </Text>
              </Box>
            ) : (
              <Box flexDirection="column">
                <Box marginBottom={0}>
                  <Text bold>Title: </Text>
                  <Text color="white" wrap="truncate-end">
                    {selectedTask.title}
                  </Text>
                </Box>

                {selectedTask.objective && (
                  <Box marginBottom={0}>
                    <Text bold>Objective: </Text>
                    <Text dimColor wrap="truncate-end">
                      {selectedTask.objective}
                    </Text>
                  </Box>
                )}

                <Box marginBottom={0} justifyContent="space-between">
                  <Box gap={1} flexShrink={1}>
                    <Text bold>Deps: </Text>
                    <Text dimColor wrap="truncate-end">
                      {selectedTask.dependencies.length > 0
                        ? selectedTask.dependencies.join(", ")
                        : "None (Root)"}
                    </Text>
                  </Box>
                  {selectedTask.files && selectedTask.files.length > 0 && (
                    <Box gap={1} flexShrink={1} paddingLeft={1}>
                      <Text bold>Files: </Text>
                      <Text dimColor wrap="truncate-end">
                        {selectedTask.files.join(", ")}
                      </Text>
                    </Box>
                  )}
                </Box>

                {selectedTask.errors && selectedTask.errors.length > 0 && (
                  <Box marginBottom={0}>
                    <Text color="red" bold wrap="truncate-end">
                      ✗ Error: {selectedTask.errors[0]}
                    </Text>
                  </Box>
                )}

                {/* Hotkey hint box matching SpecsScreen */}
                <Box
                  marginTop={1}
                  borderStyle="single"
                  borderColor="gray"
                  paddingX={1}
                  justifyContent="space-between"
                >
                  <Text dimColor>
                    [c] Mark Completed · [r] Retry · [x] Reset Status
                  </Text>
                </Box>
              </Box>
            )
          ) : (
            <Box paddingY={2} justifyContent="center">
              <Text dimColor>
                Select a task to inspect details and dependency graph.
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
