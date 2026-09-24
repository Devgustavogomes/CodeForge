import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigPreviewProps } from '../ConfigPreview.js';
import { theme } from '../../../../theme.js';

export const GenericPreview: React.FC<ConfigPreviewProps> = ({ config }) => {
  const source = config.intentSource;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.colors.primary}>Configuration Preview</Text>
      <Text color={theme.colors.muted}>Language: {config.language}</Text>
      <Text color={theme.colors.muted}>Runner: {config.environment}</Text>
      <Text color={theme.colors.muted}>Planner Model: {config.plannerAgent}</Text>
      <Text color={theme.colors.muted}>Executor Model: {config.executorAgent}</Text>
      <Text color={theme.colors.muted}>
        Hooks:{' '}
        {Object.values(config.hooks || {}).filter(
          (v) => Array.isArray(v) && v.length > 0,
        ).length}{' '}
        active
      </Text>
      <Text color={theme.colors.muted}>Intent Source: {source?.provider || 'filesystem'}</Text>
    </Box>
  );
};
export default GenericPreview;
