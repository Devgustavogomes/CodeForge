import React, { memo } from "react";
import { Box } from "ink";
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

export interface RunLayoutWideProps {
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

export const RunLayoutWide: React.FC<RunLayoutWideProps> = memo(
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
    const taskListMaxHeight = Math.max(4, availableRows - 3);
    const logMaxLines = Math.max(4, availableRows - 7);

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

        <Box flexDirection="row" width="100%" flexGrow={1} overflow="hidden">
          {/* Left Column: 42% TaskList */}
          <Box
            width="42%"
            flexDirection="column"
            paddingRight={1}
            overflow="hidden"
          >
            <TaskList
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              isFocused={focusedPanel === "tasks"}
              maxHeight={taskListMaxHeight}
              showFilterBadges={false}
              borderStyle="round"
            />
          </Box>

          {/* Right Column: 58% TaskDetails + LogStreamView */}
          <Box
            width="58%"
            flexDirection="column"
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
              isFocused={focusedPanel === "logs"}
              maxVisibleLines={logMaxLines}
              defaultWrap={false}
              borderStyle="round"
            />
          </Box>
        </Box>
      </Box>
    );
  },
);

RunLayoutWide.displayName = "RunLayoutWide";
export default RunLayoutWide;
