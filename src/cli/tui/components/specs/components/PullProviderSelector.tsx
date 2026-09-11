import React from 'react';
import { Box, Text } from 'ink';

export interface PullProviderSelectorProps {
  providers: readonly string[];
  selectedIndex: number;
  isFocused: boolean;
}

/**
 * Visual subcomponent for selecting the external specification provider.
 * Displays available providers and keyboard hint when focused.
 */
export const PullProviderSelector: React.FC<PullProviderSelectorProps> = ({
  providers,
  selectedIndex,
  isFocused,
}) => {
  return (
    <Box justifyContent="space-between" width="100%" marginBottom={0}>
      <Box gap={1} flexShrink={1}>
        <Text bold color={isFocused ? 'cyan' : 'white'}>
          1. Source Provider:
        </Text>
        <Box gap={1}>
          {providers.map((p, idx) => {
            const isCurrent = idx === selectedIndex;
            return (
              <Text
                key={p}
                color={isCurrent ? 'cyan' : 'gray'}
                bold={isCurrent}
              >
                {isCurrent ? `● [${p}]` : `○ ${p}`}
              </Text>
            );
          })}
        </Box>
      </Box>
      {isFocused && <Text dimColor>[←/→] Select</Text>}
    </Box>
  );
};
