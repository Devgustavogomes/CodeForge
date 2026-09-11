import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigPreviewProps } from '../ConfigPreview.js';

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
        <Text bold color="cyan">
          {title}
        </Text>
        {isLoadingAgents && <Text color="yellow">⏳</Text>}
      </Box>
      <Box flexDirection="column" marginY={0}>
        {currentAgentOptions.slice(0, 6).map((opt) => {
          const isCurrent = currentAgent === opt;
          return (
            <Box key={opt} gap={1}>
              <Text color={isCurrent ? 'cyan' : 'gray'} bold={isCurrent}>
                {isCurrent ? '❯ ●' : '  ○'}
              </Text>
              <Text color={isCurrent ? 'cyan' : 'white'} bold={isCurrent} wrap="truncate-end">
                {opt}
              </Text>
            </Box>
          );
        })}
        {currentAgentOptions.length > 6 && (
          <Text dimColor> ...and {currentAgentOptions.length - 6} more</Text>
        )}
      </Box>
    </Box>
  );
};