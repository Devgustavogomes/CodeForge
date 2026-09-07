import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import {
  useTerminalDimensions,
  Breakpoint,
} from "../../hooks/useTerminalDimensions.js";
import { TaskItem, useExecution } from "../../context/ExecutionContext.js";
import { useNavigation } from "../../context/NavigationContext.js";
import { createAppContainer } from "../../../../infrastructure/container.js";
import { PATHS } from "../../../../infrastructure/paths.js";
import { TaskList } from "./TaskList.js";
import { TaskDetails } from "./TaskDetails.js";
import { LogStreamView } from "./LogStreamView.js";

export type DashboardPanel = "tasks" | "logs";

export interface RunDashboardProps {
  breakpoint?: Breakpoint;
  tasks?: TaskItem[];
  selectedTaskId?: string | null;
  selectedTask?: TaskItem | null;
  onRetryTask?: (taskId: string) => void;
  onRetryAllFailed?: () => void;
  onCompleteTask?: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
  isInteractive?: boolean;
  defaultFocusedPanel?: DashboardPanel;
}

export function renderProgressBar(
  completed: number,
  total: number,
  barWidth: number = 20,
): string {
  if (total <= 0) return `[${"░".repeat(barWidth)}] 0% (0/0)`;
  const fraction = Math.min(1, Math.max(0, completed / total));
  const filled = Math.round(fraction * barWidth);
  const empty = barWidth - filled;
  const percent = Math.round(fraction * 100);
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percent}% (${completed}/${total})`;
}

const SpecLauncher: React.FC<{ isInteractive?: boolean }> = ({
  isInteractive = true,
}) => {
  let nav: ReturnType<typeof useNavigation> | undefined;
  try {
    nav = useNavigation();
  } catch {
    // Outside NavigationProvider
  }

  let exec: ReturnType<typeof useExecution> | undefined;
  try {
    exec = useExecution();
  } catch {
    // Outside ExecutionProvider
  }

  const [specs, setSpecs] = useState<
    Array<{ name: string; title: string; status: string; taskCount: number }>
  >([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    try {
      const container = createAppContainer();
      const list = container.listSpecsUseCase.execute();
      const enriched = list.map((s) => {
        const tasksDir = `${PATHS.tasksDir}/${s.name}`;
        let count = 0;
        if (container.gw.exists(tasksDir)) {
          count = container.gw
            .listDir(tasksDir)
            .filter((f) => f.endsWith(".json")).length;
        }
        return {
          name: s.name,
          title: s.title,
          status: s.status,
          taskCount: count,
        };
      });
      setSpecs(enriched);
    } catch {
      // fallback
    }
  }, []);

  useInput(
    (input, key) => {
      if (specs.length === 0) {
        if (input === "c") nav?.openModal("create_spec");
        if (input === "p") nav?.openModal("pull_spec");
        return;
      }

      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => (prev <= 0 ? specs.length - 1 : prev - 1));
        return;
      }

      if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => (prev >= specs.length - 1 ? 0 : prev + 1));
        return;
      }

      if (key.return) {
        const chosen = specs[selectedIndex];
        if (chosen) {
          exec?.setActiveSpec(chosen.name);
          nav?.setActiveSpec(chosen.name);
        }
        return;
      }

      if (input === "c") {
        nav?.openModal("create_spec");
      }
      if (input === "p") {
        nav?.openModal("pull_spec");
      }
    },
    { isActive: isInteractive },
  );

  if (specs.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={1}
        width="100%"
        flexGrow={1}
      >
        <Text bold color="cyan">
          🚀 Welcome to CodeForge
        </Text>
        <Box marginY={1}>
          <Text dimColor>No specifications found in .codeforge/specs/</Text>
        </Box>
        <Box gap={2} marginTop={1}>
          <Text bold color="cyan">
            [c] Create new spec
          </Text>
          <Text color="gray">│</Text>
          <Text dimColor>[p] Pull spec from remote</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
      width="100%"
      flexGrow={1}
    >
      <Box justifyContent="space-between" width="100%" marginBottom={1}>
        <Text bold color="cyan">
          ● Select a Specification
        </Text>
        <Text dimColor>[↑/↓] Move [Enter] Select</Text>
      </Box>

      <Box flexDirection="column" marginY={0}>
        {specs.map((s, idx) => {
          const isSelected = idx === selectedIndex;
          const cleanTitle = s.title.replace(/^Spec:\s*/i, "").trim();

          return (
            <Box key={s.name} justifyContent="space-between" width="100%">
              <Box gap={1} flexShrink={1}>
                <Text bold color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "❯" : " "}
                </Text>
                <Box width={22}>
                  <Text
                    bold={isSelected}
                    color={isSelected ? "cyan" : "white"}
                    wrap="truncate-end"
                  >
                    {s.name}
                  </Text>
                </Box>
                {cleanTitle && cleanTitle !== s.name ? (
                  <Text dimColor wrap="truncate-end">
                    ({cleanTitle})
                  </Text>
                ) : null}
              </Box>

              <Box flexShrink={0} paddingLeft={1}>
                <Text dimColor>
                  {s.taskCount} task{s.taskCount === 1 ? "" : "s"}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box gap={1} marginTop={1}>
        <Text bold color="cyan">
          [Enter] Start Run
        </Text>
        <Text color="gray">│</Text>
        <Text dimColor>[c] New Spec</Text>
        <Text color="gray">│</Text>
        <Text dimColor>[2] Specs Tab</Text>
      </Box>
    </Box>
  );
};

export const RunDashboard: React.FC<RunDashboardProps> = ({
  breakpoint: propBreakpoint,
  tasks: propTasks,
  selectedTaskId: propSelectedTaskId,
  selectedTask: propSelectedTask,
  onRetryTask: propOnRetryTask,
  onRetryAllFailed: propOnRetryAllFailed,
  onCompleteTask: propOnCompleteTask,
  onResetTask: propOnResetTask,
  isInteractive = true,
  defaultFocusedPanel = "tasks",
}) => {
  const terminalDims = useTerminalDimensions();
  const effectiveBreakpoint = propBreakpoint ?? terminalDims.breakpoint;

  let nav: ReturnType<typeof useNavigation> | undefined;
  try {
    nav = useNavigation();
  } catch {
    // Outside NavigationProvider
  }

  let execTasks: TaskItem[] = [];
  let execSelectedTaskId: string | null = null;
  let execSelectedTask: TaskItem | null = null;
  let execRetryTask: ((id: string) => Promise<void>) | undefined;
  let execRetryAllFailed: (() => Promise<void>) | undefined;
  let execCompleteTask: ((id: string) => Promise<void>) | undefined;
  let execResetTask: ((id: string) => Promise<void>) | undefined;
  let execSchedulerStatus: string = "idle";
  let execActiveSpec: string | null = null;

  try {
    const exec = useExecution();
    execTasks = exec.tasks;
    execSelectedTaskId = exec.selectedTaskId;
    execSelectedTask = exec.selectedTask;
    execRetryTask = exec.retryTask;
    execRetryAllFailed = exec.retryAllFailed;
    execCompleteTask = exec.completeTask;
    execResetTask = exec.resetTask;
    execSchedulerStatus = exec.schedulerStatus;
    execActiveSpec = exec.activeSpec;
  } catch {
    // Outside ExecutionProvider
  }

  const tasks = propTasks ?? execTasks;
  const selectedTaskId =
    propSelectedTaskId !== undefined ? propSelectedTaskId : execSelectedTaskId;
  const selectedTask =
    propSelectedTask !== undefined ? propSelectedTask : execSelectedTask;

  const retryTask = propOnRetryTask ?? execRetryTask;
  const retryAllFailed = propOnRetryAllFailed ?? execRetryAllFailed;
  const completeTask = propOnCompleteTask ?? execCompleteTask;
  const resetTask = propOnResetTask ?? execResetTask;

  const [focusedPanel, setFocusedPanel] =
    useState<DashboardPanel>(defaultFocusedPanel);

  // Wire hotkeys: 'r', 'R', 'c', 'x', 'Tab', 'Enter', 'Escape'
  useInput(
    (input, key) => {
      // Toggle focus between TaskList and LogStreamView on Tab
      if (key.tab || input === "\t") {
        setFocusedPanel((prev) => (prev === "tasks" ? "logs" : "tasks"));
        return;
      }

      // If in TaskList, pressing Enter switches focus to Logs panel
      if (key.return && focusedPanel === "tasks") {
        setFocusedPanel("logs");
        return;
      }

      // If in Logs, pressing Escape returns focus to TaskList
      if (key.escape && focusedPanel === "logs") {
        setFocusedPanel("tasks");
        return;
      }

      // Switch Spec with 's' if user wants to pick another spec
      if (input === "s") {
        nav?.setActiveSpec(null);
        return;
      }

      // Retry selected task
      if (input === "r") {
        if (selectedTaskId && retryTask) {
          void retryTask(selectedTaskId);
        }
        return;
      }

      // Retry all failed tasks
      if (input === "R") {
        if (retryAllFailed) {
          void retryAllFailed();
        }
        return;
      }

      // Complete selected task
      if (input === "c") {
        if (selectedTaskId && completeTask) {
          void completeTask(selectedTaskId);
        }
        return;
      }

      // Reset selected task
      if (input === "x") {
        if (selectedTaskId && resetTask) {
          void resetTask(selectedTaskId);
        }
        return;
      }
    },
    { isActive: isInteractive },
  );

  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === "completed").length,
    [tasks],
  );
  const failedCount = useMemo(
    () => tasks.filter((t) => t.status === "failed").length,
    [tasks],
  );
  const runningCount = useMemo(
    () => tasks.filter((t) => t.status === "running").length,
    [tasks],
  );

  // 0. Spec Launcher if no tasks or no spec active
  if (tasks.length === 0) {
    return <SpecLauncher isInteractive={isInteractive} />;
  }

  // 1. Minimal Layout (< 60 cols or < 12 rows)
  if (effectiveBreakpoint === "minimal") {
    const progressBar = renderProgressBar(completedCount, tasks.length, 14);

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        width="100%"
      >
        <Box justifyContent="space-between">
          <Text bold color="yellow">
            Run [Minimal]
          </Text>
          <Text
            color={
              failedCount > 0 ? "red" : runningCount > 0 ? "cyan" : "green"
            }
          >
            [{execSchedulerStatus.toUpperCase()}]
          </Text>
        </Box>

        <Box marginY={1}>
          <Text bold color="cyan">
            {progressBar}
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text color="yellow" bold>
            ⚠️ Window too small ({terminalDims.columns}x{terminalDims.rows})
          </Text>
          <Text dimColor>
            Please resize window to at least 60x12 for full dashboard.
          </Text>
        </Box>
      </Box>
    );
  }

  // 2. Compact Layout (< 100 cols or < 24 rows)
  if (effectiveBreakpoint === "compact") {
    return (
      <Box flexDirection="column" width="100%" flexGrow={1}>
        {/* Compact View Switcher Header */}
        <Box justifyContent="space-between" paddingX={1} marginBottom={0}>
          <Box gap={1}>
            <Text
              bold={focusedPanel === "tasks"}
              color={focusedPanel === "tasks" ? "cyan" : "gray"}
            >
              [Tasks]
            </Text>
            <Text color="gray">│</Text>
            <Text
              bold={focusedPanel === "logs"}
              color={focusedPanel === "logs" ? "cyan" : "gray"}
            >
              [Logs & Details]
            </Text>
          </Box>
          <Text dimColor>[Tab] Switch View</Text>
        </Box>

        {/* Conditional Panel Rendering */}
        {focusedPanel === "tasks" ? (
          <TaskList
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            isFocused={true}
          />
        ) : (
          <Box flexDirection="column" width="100%" flexGrow={1}>
            <TaskDetails task={selectedTask} />
            <LogStreamView taskId={selectedTaskId} isFocused={true} />
          </Box>
        )}
      </Box>
    );
  }

  // 3. Wide Layout (>= 100 cols and >= 24 rows)
  // Two columns: 45% TaskList on the left, 55% TaskDetails + LogStreamView on the right
  return (
    <Box flexDirection="row" width="100%" flexGrow={1} gap={1}>
      {/* Left Column: 45% TaskList */}
      <Box width="45%" flexDirection="column">
        <TaskList
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          isFocused={focusedPanel === "tasks"}
          maxHeight={6}
          showFilterBadges={false}
        />
      </Box>

      {/* Right Column: 55% TaskDetails + LogStreamView */}
      <Box width="55%" flexDirection="column" flexGrow={1}>
        <TaskDetails task={selectedTask} maxFilesShown={2} maxErrorLines={2} />
        <LogStreamView
          taskId={selectedTaskId}
          isFocused={focusedPanel === "logs"}
          maxVisibleLines={5}
        />
      </Box>
    </Box>
  );
};
