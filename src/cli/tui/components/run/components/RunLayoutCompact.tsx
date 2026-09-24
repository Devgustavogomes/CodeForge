import React, { memo } from "react";
import { Box, Text } from "ink";
import { useTerminalDimensions } from "../../../hooks/useTerminalDimensions.js";
import { theme } from "../../../theme.js";
import {
  TaskItem,
  ExecutionStatus,
  ActiveHookState,
  HookHistoryItem,
} from "../../../context/ExecutionContext.js";
import { DashboardPanel } from "../hooks/useRunDashboard.js";
import { TaskList } from "../TaskList.js";
import { TaskDetails } from "../TaskDetails.js";
import { LogStreamView } from "../LogStreamView.js";
import { DashboardMetricsPanel } from "./DashboardMetricsPanel.js";
import { HooksPanel } from "./HooksPanel.js";

export interface RunLayoutCompactProps {
  tasks: TaskItem[];
  selectedTaskId: string | null;
  logTaskId?: string | null;
  selectedTask: TaskItem | null;
  focusedPanel: DashboardPanel;
  intentName?: string;  schedulerStatus?: ExecutionStatus | string;
  startedAt?: string;
  completedAt?: string;
  terminalRows?: number;
  topMetricsPanel?: React.ReactNode;
  actionBar?: React.ReactNode;
  logs?: Record<string, string[]>;
  taskLogs?: string[];
  onCompleteTask?: () => void;
  activeHook?: ActiveHookState | null;
  hookHistory?: HookHistoryItem[];
  hasConfiguredHooks?: boolean;
}

export const RunLayoutCompact: React.FC<RunLayoutCompactProps> = memo(
  ({
    tasks,
    selectedTaskId,
    logTaskId,
    selectedTask,
    focusedPanel,
    intentName,
    schedulerStatus = "idle",
    startedAt,
    completedAt,
    terminalRows: propTerminalRows,
    topMetricsPanel,
    actionBar,
    logs,
    taskLogs: propTaskLogs,
    onCompleteTask,
    activeHook,
    hookHistory,
    hasConfiguredHooks,
  }) => {
    const terminalDims = useTerminalDimensions();
    const rows = propTerminalRows ?? terminalDims.rows ?? 24;
    const availableRows = Math.max(12, rows - 5);
    // A barra de tarefas pode ocupar duas linhas, além de uma terceira para
    // feedback. A reserva evita que os painéis avancem sobre o rodapé.
    const actionBarRows = actionBar ? 3 : 0;
    const panelRows = Math.max(8, availableRows - actionBarRows);
    const compactTaskListHeight = Math.max(4, Math.min(Math.floor(panelRows * 0.58), panelRows - 5 - (hookHistory?.length ?? 0)));

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
            intentName={intentName}
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
              color={focusedPanel === "tasks" ? theme.colors.primary : theme.colors.muted}
            >
              [Tasks]
            </Text>
            <Text color={theme.colors.borderSubtle}>│</Text>
            <Text
              bold={focusedPanel === "logs"}
              color={focusedPanel === "logs" ? theme.colors.primary : theme.colors.muted}
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
            <Box flexShrink={0}>
              <TaskList
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                isFocused={true}
                maxHeight={Math.max(2, compactTaskListHeight - 2)}
                borderStyle="round"
                onCompleteTask={onCompleteTask}
              />
            </Box>
            <Box flexGrow={1} overflow="hidden">
              <HooksPanel
                activeHook={activeHook}
                hookHistory={hookHistory}
                hasConfiguredHooks={hasConfiguredHooks}
                borderStyle="round"
                maxHeight={Math.max(4, panelRows - compactTaskListHeight)}
              />
            </Box>
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
              taskId={logTaskId === undefined ? selectedTaskId : logTaskId}
              logs={effectiveTaskLogs}
              isFocused={true}
              maxVisibleLines={Math.max(4, panelRows - 9)}
              defaultWrap={false}
              borderStyle="round"
            />
          </Box>
        )}
        {actionBar && (
          <Box width="100%" flexShrink={0} overflow="hidden">
            {actionBar}
          </Box>
        )}
      </Box>
    );
  },
);

RunLayoutCompact.displayName = "RunLayoutCompact";
export default RunLayoutCompact;
