import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigFieldProps } from '../ConfigField.js';

export const HooksField: React.FC<ConfigFieldProps> = ({
  isActive,
  config,
}) => {
  const totalHooks = Object.values(config.hooks || {}).reduce(
    (acc, list) => acc + (Array.isArray(list) ? list.length : 0),
    0,
  );

  return (
    <Box width="100%">
      <Box gap={1} flexShrink={1}>
        <Text bold color={isActive ? 'cyan' : 'white'}>
          5. Hooks:
        </Text>
        <Text color="cyan" bold>
          [ {totalHooks} configurados ]
        </Text>
      </Box>
    </Box>
  );
};
