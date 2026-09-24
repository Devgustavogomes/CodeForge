import React from 'react';
import { Box, Text } from 'ink';
import { TaskStatus } from '../../../../../domain/execution.js';
import { theme } from '../../../theme.js';
import { TaskItem } from '../../../context/ExecutionContext/taskLoader.js';

export type TaskScreenItem = TaskItem;

export const STATUS_ICONS: Record<
  TaskStatus,
  { icon: string; color: string; label: string }
> = {
  pending: {
    icon: theme.status.pending.icon,
    color: theme.status.pending.color,
    label: '[PENDING]',
  },
  running: {
    icon: theme.status.running.icon,
    color: theme.status.running.color,
    label: '[RUNNING]',
  },
  completed: {
    icon: theme.status.completed.icon,
    color: theme.status.completed.color,
    label: '[COMPLETED]',
  },
  failed: {
    icon: theme.status.failed.icon,
    color: theme.status.failed.color,
    label: '[FAILED]',
  },
};

export interface TaskTreeProps {
  tasks: TaskItem[];
  visibleTasks: TaskItem[];
  selectedTaskId: string | null;
  intents: string[];
  selectedIntentIndex: number;
  currentIntent: string;
  isSideBySide: boolean;
  isSearchingIntent?: boolean;
  intentSearchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSearchSubmit?: () => void;
  onSearchCancel?: () => void;
}

export const TaskTree: React.FC<TaskTreeProps> = ({
  tasks,
  visibleTasks,
  selectedTaskId,
  intents,
  selectedIntentIndex,
  currentIntent,
  isSideBySide,
  isSearchingIntent = false,
  intentSearchQuery = '',
  onSearchChange: _onSearchChange,
  onSearchSubmit: _onSearchSubmit,
  onSearchCancel: _onSearchCancel,
}) => {
  return (
    <Box
      flexDirection="column"
      width={isSideBySide ? '45%' : '100%'}
      borderStyle="round"
      borderColor={theme.colors.borderSubtle}
      paddingX={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Box gap={1} flexShrink={1}>
          <Text bold color={theme.colors.primary}>
            Tasks ({tasks.length})
          </Text>
          {intents.length > 0 ? (
            <Box gap={1} flexShrink={1}>
              <Text color={theme.colors.accent} bold>
                ● [{currentIntent}]
              </Text>
              {intents.length > 1 && (
                <Text color={theme.colors.muted}>
                  ({selectedIntentIndex + 1}/{intents.length})
                </Text>
              )}
            </Box>
          ) : (
            <Text color={theme.colors.muted}>• No Intent</Text>
          )}
        </Box>
        <Box flexShrink={0} gap={1}>
          <Text color={theme.colors.muted}>[/] Search</Text>
          <Text color={theme.colors.muted}>[←/→]</Text>
        </Box>
      </Box>

      {/* Intent Search Bar */}
      {isSearchingIntent && (
        <Box
          marginBottom={1}
          paddingX={1}
          borderStyle="single"
          borderColor={theme.colors.borderActive}
          flexDirection="column"
        >
          <Box gap={1}>
            <Text bold color={theme.colors.primary}>Search:</Text>
            <Text color={theme.colors.text} bold>
              {intentSearchQuery}█
            </Text>
          </Box>
          <Box justifyContent="flex-end">
            <Text color={theme.colors.muted}>[Enter] Done  [Esc] Clear</Text>
          </Box>
        </Box>
      )}

      {tasks.length === 0 ? (
        <Box paddingY={2} justifyContent="center">
          <Text color={theme.colors.muted}>No tasks found for intent "{currentIntent}".</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleTasks.map((task) => {
            const isSelected = task.id === selectedTaskId;
            const statusInfo = STATUS_ICONS[task.status] ?? STATUS_ICONS.pending;

            return (
              <Box
                key={task.id}
                justifyContent="space-between"
                width="100%"
              >
                <Box gap={1} flexShrink={1}>
                  {/* Selector indicator */}
                  <Box flexShrink={0}>
                    <Text color={isSelected ? theme.colors.primary : undefined} bold={isSelected}>
                      {isSelected ? theme.symbols.pointer : ' '}
                    </Text>
                  </Box>

                  {/* Status icon + Task ID */}
                  <Box flexShrink={0} gap={1}>
                    <Text color={statusInfo.color} bold>
                      {statusInfo.icon}
                    </Text>
                    <Text color={statusInfo.color} bold>
                      {task.id}
                    </Text>
                  </Box>

                  {/* Title */}
                  <Text
                    color={isSelected ? theme.colors.primary : theme.colors.text}
                    wrap="truncate-end"
                  >
                    {task.title}
                  </Text>
                </Box>

                {/* Status Badge */}
                <Box flexShrink={0} paddingLeft={1}>
                  <Text color={statusInfo.color}>{statusInfo.label}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
