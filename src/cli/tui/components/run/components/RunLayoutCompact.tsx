import React, { memo } from "react";
import { Box, Text } from "ink";
import { useTerminalDimensions } from "../../../hooks/useTerminalDimensions.js";
import {
  TaskItem,
  ExecutionStatus,
} from "../../../context/ExecutionContext.js";
import { DashboardPanel } from "../hooks/useRunDashboard.js";
import { TaskList } from "../TaskList.js";
import { TaskDetails } from "../TaskDetails.js";
import { LogStreamView } from "../LogStreamView.js";
import { DashboardMetricsPanel } from "./DashboardMetricsPanel.js";

export interface RunLayoutCompactProps {
  tasks: TaskItem[];
  selectedTaskId: string | null;
  selectedTask: TaskItem | null;
  focusedPanel: DashboardPanel;
  specName?: string;
  schedulerStatus?: ExecutionStatus | string;
  startedAt?: string;
  completedAt?: string;
  terminalRows?: number;
  topMetricsPanel?: React.ReactNode;
  logs?: Record<string, string[]>;
  taskLogs?: string[];
}

export const RunLayoutCompact: React.FC<RunLayoutCompactProps> = memo(
  ({
    tasks,
    selectedTaskId,
    selectedTask,
    focusedPanel,
    specName = "current-spec",
    schedulerStatus = "idle",
    startedAt,
    completedAt,
    terminalRows: propTerminalRows,
    topMetricsPanel,
    logs,
    taskLogs: propTaskLogs,
  }) => {
    const terminalDims = useTerminalDimensions();
    const rows = propTerminalRows ?? terminalDims.rows ?? 24;
    const availableRows = Math.max(12, rows - 5);

    const effectiveTaskLogs =
      propTaskLogs !== undefined
        ? propTaskLogs
        : selectedTaskId && logs
          ? logs[selectedTaskId]
          : undefined;

    return (
      <Box
        flexDirection="column"
        width="100%"
        height={availableRows}
        flexGrow={1}
        overflow="hidden"
      >
        {/* Top Metrics / Banner */}
        {topMetricsPanel ?? (
          <DashboardMetricsPanel
            specName={specName}
            tasks={tasks}
            schedulerStatus={schedulerStatus}
            startedAt={startedAt}
            completedAt={completedAt}
          />
        )}

        {/* Compact View Switcher Header */}
        <Box
          justifyContent="space-between"
          paddingX={1}
          marginBottom={0}
          flexShrink={0}
        >
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
          <Box
            flexDirection="column"
            width="100%"
            flexGrow={1}
            overflow="hidden"
          >
            <TaskList
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              isFocused={true}
              maxHeight={Math.max(6, availableRows - 6)}
              borderStyle="round"
            />
          </Box>
        ) : (
          <Box
            flexDirection="column"
            width="100%"
            flexGrow={1}
            gap={0}
            overflow="hidden"
          >
            <Box paddingX={1} marginBottom={0} overflow="hidden">
              <TaskDetails
                task={selectedTask}
                compact={true}
                maxFilesShown={2}
                maxErrorLines={2}
              />
            </Box>
            <LogStreamView
              taskId={selectedTaskId}
              logs={effectiveTaskLogs}
              isFocused={true}
              maxVisibleLines={Math.max(4, availableRows - 9)}
              defaultWrap={false}
              borderStyle="round"
            />
          </Box>
        )}
      </Box>
    );
  },
);

RunLayoutCompact.displayName = "RunLayoutCompact";
export default RunLayoutCompact;
