import React from 'react';
import { Box, Text } from 'ink';
import { SpecReference } from '../../../../../domain/spec-source.js';
import { theme } from '../../../theme.js';

export interface PullItemListProps {
  items: SpecReference[];
  selectedItemIndex: number;
  isManualInput: boolean;
  isFetchingItems: boolean;
  selectedProvider: string;
  isFocused: boolean;
}

const MAX_VISIBLE_ITEMS = 3;

/**
 * Visual subcomponent for displaying and navigating remote items (issues, specs).
 * Supports windowed scrolling, status indicators, and manual input fallback option.
 */
export const PullItemList: React.FC<PullItemListProps> = ({
  items,
  selectedItemIndex,
  isManualInput,
  isFetchingItems,
  selectedProvider,
  isFocused,
}) => {
  const visibleStartIndex =
    items.length <= MAX_VISIBLE_ITEMS
      ? 0
      : Math.min(
          Math.max(0, selectedItemIndex - 1),
          items.length - MAX_VISIBLE_ITEMS
        );
  const visibleItems = items.slice(
    visibleStartIndex,
    visibleStartIndex + MAX_VISIBLE_ITEMS
  );

  return (
    <Box flexDirection="column" width="100%" marginBottom={0}>
      <Box justifyContent="space-between" width="100%">
        <Box gap={1} flexShrink={1}>
          <Text bold color={isFocused ? theme.colors.primary : theme.colors.text}>
            Spec ID / Issue Number / URL:
          </Text>
          {isFetchingItems && (
            <Text color={theme.colors.warning}>Querying {selectedProvider}...</Text>
          )}
        </Box>
        {isFocused && items.length > 0 && !isManualInput && (
          <Text dimColor>[↑/↓] Select · [m] Manual</Text>
        )}
      </Box>

      {items.length > 0 && (
        <Box flexDirection="column" paddingLeft={1} marginY={0}>
          {visibleItems.map((item, idx) => {
            const itemGlobalIdx = visibleStartIndex + idx;
            const isSelected =
              isFocused && !isManualInput && selectedItemIndex === itemGlobalIdx;
            return (
              <Box key={item.id} justifyContent="space-between" width="100%">
                <Box gap={1} flexShrink={1}>
                  <Text color={isSelected ? theme.colors.primary : theme.colors.muted} bold={isSelected}>
                    {isSelected ? '> ●' : '  ○'}
                  </Text>
                  <Text
                    bold={isSelected}
                    color={isSelected ? theme.colors.primary : theme.colors.text}
                    wrap="truncate-end"
                  >
                    #{item.id} {item.title}
                  </Text>
                </Box>
                {item.status && (
                  <Text color={item.status === 'open' ? theme.colors.success : theme.colors.muted}>
                    [{item.status}]
                  </Text>
                )}
              </Box>
            );
          })}

          <Box justifyContent="space-between" width="100%">
            <Box gap={1} flexShrink={1}>
              <Text
                color={isFocused && isManualInput ? theme.colors.primary : theme.colors.muted}
                bold={isFocused && isManualInput}
              >
                {isFocused && isManualInput ? '> ●' : '  ○'}
              </Text>
              <Text
                color={isFocused && isManualInput ? theme.colors.primary : theme.colors.muted}
                bold={isFocused && isManualInput}
              >
                [Manual ID / URL Input]
              </Text>
            </Box>
            {items.length > MAX_VISIBLE_ITEMS && (
              <Text dimColor>
                ({selectedItemIndex + 1}/{items.length + 1})
              </Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
