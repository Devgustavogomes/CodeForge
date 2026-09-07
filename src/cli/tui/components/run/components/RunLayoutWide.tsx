import React, { memo } from 'react';
import { Box } from 'ink';
import { useTerminalDimensions } from '../../../hooks/useTerminalDimensions.js';
import { TaskItem, ExecutionStatus } from '../../../context/ExecutionContext.js';
import { DashboardPanel } from '../hooks/useRunDashboard.js';
import { TaskList } from '../TaskList.js';
import { TaskDetails } from '../TaskDetails.js';
import { LogStreamView } from '../LogStreamView.js';
import { DashboardMetricsPanel } from './DashboardMetricsPanel.js';

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
}

export const RunLayoutWide: React.FC<RunLayoutWideProps> = memo(({
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

  const availableRows = Math.max(10, rows - 10);
  const taskListMaxHeight = Math.max(3, Math.min(6, availableRows - 5));
  const logMaxLines = Math.max(2, Math.min(4, Math.floor((availableRows - 8) / 2)));

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

      <Box flexDirection="row" width="100%" flexGrow={1}>
        {/* Left Column: 46% TaskList */}
        <Box width="46%" flexDirection="column" paddingRight={1}>
          <TaskList
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            isFocused={focusedPanel === 'tasks'}
            maxHeight={taskListMaxHeight}
            showFilterBadges={false}
          />
        </Box>

        {/* Right Column: 54% TaskDetails + LogStreamView */}
        <Box width="54%" flexDirection="column" flexGrow={1}>
          <TaskDetails task={selectedTask} maxFilesShown={1} maxErrorLines={2} />
          <LogStreamView
            taskId={selectedTaskId}
            isFocused={focusedPanel === 'logs'}
            maxVisibleLines={logMaxLines}
            defaultWrap={false}
          />
        </Box>
      </Box>
    </Box>
  );
});

RunLayoutWide.displayName = 'RunLayoutWide';
export default RunLayoutWide;
