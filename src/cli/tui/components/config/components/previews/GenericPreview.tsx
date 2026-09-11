import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigPreviewProps } from '../ConfigPreview.js';

export const GenericPreview: React.FC<ConfigPreviewProps> = ({ config }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">Configuration Preview</Text>
      <Text dimColor>Language: {config.language}</Text>
      <Text dimColor>Runner: {config.environment}</Text>
      <Text dimColor>Planner Model: {config.plannerAgent}</Text>
      <Text dimColor>Executor Model: {config.executorAgent}</Text>
      <Text dimColor>
        Hooks:{' '}
        {Object.values(config.hooks || {}).filter(
          (v) => Array.isArray(v) && v.length > 0,
        ).length}{' '}
        active
      </Text>
      <Text dimColor>Spec Source: {config.specSource?.provider || 'filesystem'}</Text>
    </Box>
  );
};