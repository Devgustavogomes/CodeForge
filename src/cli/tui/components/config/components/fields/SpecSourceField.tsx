import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigFieldProps } from '../ConfigField.js';

export const SpecSourceField: React.FC<ConfigFieldProps> = ({
  isActive,
  config,
}) => {
  const provider = config.specSource?.provider || 'filesystem';
  const project = config.specSource?.project as string | undefined;
  const team = config.specSource?.team as string | undefined;
  const details = project
    ? `${provider} (${project})`
    : team
      ? `${provider} (${team})`
      : provider;

  return (
    <Box width="100%">
      <Box gap={1} flexShrink={1} flexWrap="wrap">
        <Text bold color={isActive ? 'cyan' : 'white'}>
          6. Spec Source:
        </Text>
        <Text color="cyan" bold>
          [ {details} ]
        </Text>
      </Box>
    </Box>
  );
};
