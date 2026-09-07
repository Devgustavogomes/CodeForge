import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { useTerminalDimensions } from '../../../hooks/useTerminalDimensions.js';
import { TaskItem, ExecutionStatus } from '../../../context/ExecutionContext.js';
import { DashboardPanel } from '../hooks/useRunDashboard.js';
import { TaskList } from '../TaskList.js';
import { TaskDetails } from '../TaskDetails.js';
import { LogStreamView } from '../LogStreamView.js';
import { DashboardMetricsPanel } from './DashboardMetricsPanel.js';

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
}

export const RunLayoutCompact: React.FC<RunLayoutCompactProps> = memo(({
  tasks,
  selectedTaskId,
  selectedTask,
  focusedPanel,
  specName = 'current-spec',
  schedulerStatus = 'idle',
  startedAt,
  completedAt,
  terminalRows: propTerminalRows,
  topMetricsPanel,
}) => {
  const terminalDims = useTerminalDimensions();
  const rows = propTerminalRows ?? terminalDims.rows ?? 24;

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
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
      <Box justifyContent="space-between" paddingX={1} marginBottom={0}>
        <Box gap={1}>
          <Text
            bold={focusedPanel === 'tasks'}
            color={focusedPanel === 'tasks' ? 'cyan' : 'gray'}
          >
            [Tasks]
          </Text>
          <Text color="gray">│</Text>
          <Text
            bold={focusedPanel === 'logs'}
            color={focusedPanel === 'logs' ? 'cyan' : 'gray'}
          >
            [Logs & Details]
          </Text>
        </Box>
        <Text dimColor>[Tab] Switch View</Text>
      </Box>

      {/* Conditional Panel Rendering */}
      {focusedPanel === 'tasks' ? (
        <TaskList
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          isFocused={true}
          maxHeight={Math.max(6, rows - 8)}
          borderStyle="round"
        />
      ) : (
        <Box flexDirection="column" width="100%" flexGrow={1} gap={0}>
          <Box paddingX={1} marginBottom={0}>
            <TaskDetails
              task={selectedTask}
              compact={true}
              maxFilesShown={2}
              maxErrorLines={2}
            />
          </Box>
          <LogStreamView
            taskId={selectedTaskId}
            isFocused={true}
            maxVisibleLines={Math.max(4, rows - 10)}
            defaultWrap={false}
            borderStyle="round"
          />
        </Box>
      )}
    </Box>
  );
});

RunLayoutCompact.displayName = 'RunLayoutCompact';
export default RunLayoutCompact;
