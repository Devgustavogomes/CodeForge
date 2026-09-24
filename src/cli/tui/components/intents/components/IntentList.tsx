import React, { memo, useMemo } from 'react';
import { Box, Text } from 'ink';
import { IntentInfo } from '../../../../../application/use-cases/ListIntentsUseCase.js';
import { theme } from '../../../theme.js';

export interface IntentItemWithStats extends IntentInfo {
  taskCount: number;
  updatedAt?: string;
}
export const STATUS_BADGE_MAP: Record<string, { label: string; color: string }> = {
  not_started: { label: '[NOT STARTED]', color: theme.colors.muted },
  planned: { label: '[PLANNED]', color: theme.colors.primary },
  in_progress: { label: '[IN PROGRESS]', color: theme.colors.warning },
  completed: { label: '[COMPLETED]', color: theme.colors.success },
};

export interface IntentListProps {
  intents?: IntentItemWithStats[];  selectedIndex: number;
  isSideBySide?: boolean;
}

export const IntentList: React.FC<IntentListProps> = memo(({
  intents: propIntents,
    selectedIndex,
  isSideBySide = true,
}) => {
  const intents = propIntents ?? [];
  const maxVisibleIntents = 6;
  const visibleIntents = useMemo(() => {
    if (intents.length <= maxVisibleIntents) return intents;
    const selectedIdx = Math.max(0, selectedIndex);
    let start = Math.max(0, selectedIdx - Math.floor(maxVisibleIntents / 2));
    if (start + maxVisibleIntents > intents.length) {
      start = Math.max(0, intents.length - maxVisibleIntents);
    }
    return intents.slice(start, start + maxVisibleIntents);
  }, [intents, maxVisibleIntents, selectedIndex]);

  const selectedIntent = intents[selectedIndex] ?? null;

  return (
    <Box
      flexDirection="column"
      width={isSideBySide ? '45%' : '100%'}
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={1}
    >
      <Box justifyContent="space-between" marginBottom={0}>
        <Text bold color={theme.colors.primary}>
          Intents ({intents.length})
        </Text>
        <Text dimColor>[c] Create · [P] Pull</Text>
      </Box>

      {intents.length === 0 ? (
        <Box paddingY={1} justifyContent="center" flexDirection="column" alignItems="center">
          <Text dimColor>No intents found in .codeforge/intents/</Text>
          <Text dimColor>Press 'c' to create a new intent or 'P' to pull from GitHub/Linear.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleIntents.map((intent) => {
            const isSelected = selectedIntent?.name === intent.name;
            const badge = STATUS_BADGE_MAP[intent.status] ?? {
              label: `[${intent.status.toUpperCase()}]`,
              color: theme.colors.muted,
            };

            return (
              <Box key={intent.name} justifyContent="space-between" width="100%">
                <Box gap={1} flexShrink={1}>
                  <Text color={isSelected ? theme.colors.primary : undefined} bold={isSelected}>
                    {isSelected ? '>' : ' '}
                  </Text>
                  <Box width={14}>
                    <Text bold={isSelected} color={isSelected ? theme.colors.primary : theme.colors.text} wrap="truncate-end">
                      {intent.name}
                    </Text>
                  </Box>
                  <Text color={badge.color} bold>
                    {badge.label}
                  </Text>
                </Box>
                <Box flexShrink={0} paddingLeft={1}>
                  <Text dimColor>{intent.taskCount} tasks</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
});

IntentList.displayName = 'IntentList';export default IntentList;
