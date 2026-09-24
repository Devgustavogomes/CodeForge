import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigFieldProps } from '../ConfigField.js';
import { theme } from '../../../../theme.js';

export const IntentSourceField: React.FC<ConfigFieldProps> = ({
  isActive,
  config,
}) => {
  const source =
    config.intentSource;
  const provider = source?.provider || 'filesystem';
  const project = source?.project as string | undefined;
  const team = source?.team as string | undefined;
  const details = project
    ? `${provider} (${project})`
    : team
      ? `${provider} (${team})`
      : provider;

  return (
    <Box width="100%">
      <Box gap={1} flexShrink={1} flexWrap="wrap">
        <Text bold color={isActive ? theme.colors.primary : theme.colors.text}>
          6. Intent Source:
        </Text>
        <Text color={theme.colors.primary} bold>
          [ {details} ]
        </Text>
      </Box>
    </Box>
  );
};export default IntentSourceField;
