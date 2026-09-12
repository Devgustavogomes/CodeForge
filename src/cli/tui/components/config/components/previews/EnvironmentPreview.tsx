import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigPreviewProps } from '../ConfigPreview.js';
import { theme } from '../../../../theme.js';

export const EnvironmentPreview: React.FC<ConfigPreviewProps> = ({
  config,
  availableEnvironments,
}) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.colors.primary}>Runner Environments</Text>
      <Box flexDirection="column" marginY={0}>
        {availableEnvironments.map((env) => {
          const isCurrent = config.environment === env;
          return (
            <Box key={env} gap={1}>
              <Text color={isCurrent ? theme.colors.primary : theme.colors.muted} bold={isCurrent}>
                {isCurrent ? '> ●' : '  ○'}
              </Text>
              <Text color={isCurrent ? theme.colors.primary : theme.colors.text} bold={isCurrent}>
                {env}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
