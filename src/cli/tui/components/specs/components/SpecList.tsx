import React, { memo, useMemo } from 'react';
import { Box, Text } from 'ink';
import { SpecInfo } from '../../../../../application/use-cases/ListSpecsUseCase.js';

export interface SpecItemWithStats extends SpecInfo {
  taskCount: number;
  updatedAt?: string;
}

export const STATUS_BADGE_MAP: Record<string, { label: string; color: string }> = {
  not_started: { label: '[NOT STARTED]', color: 'gray' },
  planned: { label: '[PLANNED]', color: 'blue' },
  in_progress: { label: '[IN PROGRESS]', color: 'yellow' },
  completed: { label: '[COMPLETED]', color: 'green' },
};

export interface SpecListProps {
  specs: SpecItemWithStats[];
  selectedIndex: number;
  isSideBySide?: boolean;
}

export const SpecList: React.FC<SpecListProps> = memo(({
  specs,
  selectedIndex,
  isSideBySide = true,
}) => {
  const maxVisibleSpecs = 6;
  const visibleSpecs = useMemo(() => {
    if (specs.length <= maxVisibleSpecs) return specs;
    const selectedIdx = Math.max(0, selectedIndex);
    let start = Math.max(0, selectedIdx - Math.floor(maxVisibleSpecs / 2));
    if (start + maxVisibleSpecs > specs.length) {
      start = Math.max(0, specs.length - maxVisibleSpecs);
    }
    return specs.slice(start, start + maxVisibleSpecs);
  }, [specs, maxVisibleSpecs, selectedIndex]);

  const selectedSpec = specs[selectedIndex] ?? null;

  return (
    <Box
      flexDirection="column"
      width={isSideBySide ? '45%' : '100%'}
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
    >
      <Box justifyContent="space-between" marginBottom={0}>
        <Text bold color="blue">
          Specifications ({specs.length})
        </Text>
        <Text dimColor>[c] Create · [P] Pull</Text>
      </Box>

      {specs.length === 0 ? (
        <Box paddingY={1} justifyContent="center" flexDirection="column" alignItems="center">
          <Text dimColor>No specifications found in .codeforge/specs/</Text>
          <Text dimColor>Press 'c' to create a new spec or 'P' to pull from GitHub/Linear.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleSpecs.map((spec) => {
            const isSelected = selectedSpec?.name === spec.name;
            const badge = STATUS_BADGE_MAP[spec.status] ?? {
              label: `[${spec.status.toUpperCase()}]`,
              color: 'gray',
            };

            return (
              <Box key={spec.name} justifyContent="space-between" width="100%">
                <Box gap={1} flexShrink={1}>
                  <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                    {isSelected ? '>' : ' '}
                  </Text>
                  <Box width={14}>
                    <Text bold={isSelected} color={isSelected ? 'cyan' : 'white'} wrap="truncate-end">
                      {spec.name}
                    </Text>
                  </Box>
                  <Text color={badge.color} bold>
                    {badge.label}
                  </Text>
                </Box>
                <Box flexShrink={0} paddingLeft={1}>
                  <Text dimColor>{spec.taskCount} tasks</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
});

SpecList.displayName = 'SpecList';
export default SpecList;
