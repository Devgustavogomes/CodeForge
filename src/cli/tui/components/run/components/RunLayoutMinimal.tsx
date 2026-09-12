import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { useTerminalDimensions } from '../../../hooks/useTerminalDimensions.js';
import { theme } from '../../../theme.js';
import { renderProgressBar } from './DashboardMetricsPanel.js';

export interface RunLayoutMinimalProps {
  completedCount: number;
  totalCount: number;
  failedCount: number;
  runningCount: number;
  effectiveStatus: string;
  terminalColumns?: number;
  terminalRows?: number;
}

export const RunLayoutMinimal: React.FC<RunLayoutMinimalProps> = memo(({
  completedCount,
  totalCount,
  failedCount,
  runningCount,
  effectiveStatus,
  terminalColumns,
  terminalRows,
}) => {
  const terminalDims = useTerminalDimensions();
  const columns = terminalColumns ?? terminalDims.columns;
  const rows = terminalRows ?? terminalDims.rows;
  const progressBar = renderProgressBar(completedCount, totalCount, 14);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.warning}
      paddingX={1}
      width="100%"
      overflow="hidden"
    >
      <Box justifyContent="space-between">
        <Text bold color={theme.colors.warning}>
          Run [Minimal]
        </Text>
        <Text
          color={
            failedCount > 0
              ? theme.colors.error
              : runningCount > 0
                ? theme.colors.primary
                : theme.colors.success
          }
        >
          [{effectiveStatus.toUpperCase()}]
        </Text>
      </Box>

      <Box marginY={1}>
        <Text bold color={theme.colors.primary}>
          {progressBar}
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text color={theme.colors.warning} bold>
          ⚠️ Window too small ({columns}x{rows})
        </Text>
        <Text dimColor>
          Please resize window to at least 60x12 for full dashboard.
        </Text>
      </Box>
    </Box>
  );
});

RunLayoutMinimal.displayName = 'RunLayoutMinimal';
export default RunLayoutMinimal;
