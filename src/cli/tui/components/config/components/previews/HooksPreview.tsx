import React from 'react';
import { Box, Text } from 'ink';
import { HOOK_EVENTS } from '../../../../../../domain/hook.js';
import type { ConfigPreviewProps } from '../ConfigPreview.js';
import { theme } from '../../../../theme.js';

export const HooksPreview: React.FC<ConfigPreviewProps> = ({ config }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.colors.primary}>
        Hooks Summary
      </Text>
      <Box flexDirection="column" marginY={0}>
        {HOOK_EVENTS.filter(
          (event) => (config.hooks?.[event]?.length ?? 0) > 0,
        ).map((event) => {
          const list = config.hooks?.[event] || [];
          const types = Array.from(
            new Set(list.map((h) => h.type || 'notify')),
          ).join('/');
          return (
            <Box key={event}>
              <Text color={theme.colors.text}>
                {event}: {list.length} {list.length === 1 ? 'hook' : 'hooks'} [{types}]
              </Text>
            </Box>
          );
        })}
        <Text color={theme.colors.muted}>outros: 0</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.colors.primary} bold>
          [Enter] Abrir Gerenciador de Hooks
        </Text>
      </Box>
    </Box>
  );
};
