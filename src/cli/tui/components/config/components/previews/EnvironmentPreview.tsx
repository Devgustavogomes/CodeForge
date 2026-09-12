import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigPreviewProps } from '../ConfigPreview.js';

export const EnvironmentPreview: React.FC<ConfigPreviewProps> = ({
  config,
  availableEnvironments,
}) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">Runner Environments</Text>
      <Box flexDirection="column" marginY={0}>
        {availableEnvironments.map((env) => {
          const isCurrent = config.environment === env;
          return (
            <Box key={env} gap={1}>
              <Text color={isCurrent ? 'cyan' : 'gray'} bold={isCurrent}>
                {isCurrent ? '> ●' : '  ○'}
              </Text>
              <Text color={isCurrent ? 'cyan' : 'white'} bold={isCurrent}>
                {env}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};