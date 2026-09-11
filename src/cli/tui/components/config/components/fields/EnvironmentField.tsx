import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigFieldProps } from '../ConfigField.js';

export const EnvironmentField: React.FC<ConfigFieldProps> = ({
  isActive,
  config,
  availableEnvironments,
}) => {
  return (
    <Box width="100%">
      <Box gap={1} flexShrink={1}>
        <Text bold color={isActive ? 'cyan' : 'white'}>
          2. Runner Environment:
        </Text>
        <Box gap={1}>
          <Text color="cyan" bold>
            &lt; [ {config.environment} ] &gt;
          </Text>
          {availableEnvironments.length > 1 && (
            <Text dimColor>
              (
              {Math.max(
                1,
                availableEnvironments.indexOf(config.environment) + 1,
              )}
              /{availableEnvironments.length})
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
