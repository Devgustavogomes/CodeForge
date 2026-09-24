import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigPreviewProps } from '../ConfigPreview.js';
import { theme } from '../../../../theme.js';

export const AgentPreview: React.FC<ConfigPreviewProps> = ({
  activeField,
  config,
  isLoadingAgents,
  currentAgentOptions,
}) => {
  const isPlanner = activeField === 'plannerAgent';
  const currentAgent = isPlanner ? config.plannerAgent : config.executorAgent;
  const title = `${isPlanner ? 'Planner' : 'Executor'} Models (${config.environment})`;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between" marginBottom={0}>
        <Text bold color={theme.colors.primary}>
          {title}
        </Text>
        {isLoadingAgents && <Text color={theme.colors.warning}>...</Text>}
      </Box>
      <Box flexDirection="column" marginY={0}>
        {currentAgentOptions.slice(0, 6).map((opt) => {
          const isCurrent = currentAgent === opt;
          return (
            <Box key={opt} gap={1}>
              <Text color={isCurrent ? theme.colors.primary : theme.colors.muted} bold={isCurrent}>
                {isCurrent ? '> ●' : '  ○'}
              </Text>
              <Text color={isCurrent ? theme.colors.primary : theme.colors.text} bold={isCurrent} wrap="truncate-end">
                {opt}
              </Text>
            </Box>
          );
        })}
        {currentAgentOptions.length > 6 && (
          <Text color={theme.colors.muted}> ...and {currentAgentOptions.length - 6} more</Text>
        )}
      </Box>
    </Box>
  );
};
