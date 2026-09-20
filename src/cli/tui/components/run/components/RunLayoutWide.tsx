import React, { memo } from "react";
import { Box } from "ink";
import { useTerminalDimensions } from "../../../hooks/useTerminalDimensions.js";
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

export interface RunLayoutWideProps {
  tasks: TaskItem[];
  selectedTaskId: string | null;
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

export const RunLayoutWide: React.FC<RunLayoutWideProps> = memo(
  ({
    tasks,
    selectedTaskId,
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
    // A barra de tarefas usa duas linhas e pode receber uma terceira de
    // feedback. Reservamos esse máximo para que a área de logs não ultrapasse
    // o rodapé em terminais baixos.
    const actionBarRows = actionBar ? 3 : 0;
    const panelRows = Math.max(8, availableRows - actionBarRows);
    const taskListHeight = Math.max(4, Math.floor(panelRows * 0.58));
    const logMaxLines = Math.max(4, panelRows - 7);

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

        <Box flexDirection="row" width="100%" flexGrow={1} overflow="hidden">
          {/* Left Column: 42% TaskList + HooksPanel */}
          <Box
            width="42%"
            flexDirection="column"
            paddingRight={1}
            overflow="hidden"
            flexGrow={1}
          >
            <Box flexShrink={0}>
              <TaskList
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                isFocused={focusedPanel === "tasks"}
                maxHeight={Math.max(2, taskListHeight - 2)}
                showFilterBadges={false}
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
              />
            </Box>
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
        {actionBar && (
          <Box width="100%" flexShrink={0} overflow="hidden">
            {actionBar}
          </Box>
        )}
      </Box>
    );
  },
);

RunLayoutWide.displayName = "RunLayoutWide";
export default RunLayoutWide;
