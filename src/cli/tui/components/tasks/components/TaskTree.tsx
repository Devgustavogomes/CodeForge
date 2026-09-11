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
  pending: { icon: '○', color: 'gray', label: '[PENDING]' },
  running: { icon: '▶', color: 'cyan', label: '[RUNNING]' },
  completed: { icon: '√', color: 'green', label: '[COMPLETED]' },
  failed: { icon: '×', color: 'red', label: '[FAILED]' },
};

export interface TaskTreeProps {
  tasks: TaskItem[];
  visibleTasks: TaskItem[];
  selectedTaskId: string | null;
  specs: string[];
  selectedSpecIndex: number;
  currentSpec: string;
  isSideBySide: boolean;
  isSearchingSpec?: boolean;
  specSearchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSearchSubmit?: () => void;
  onSearchCancel?: () => void;
}

export const TaskTree: React.FC<TaskTreeProps> = ({
  tasks,
  visibleTasks,
  selectedTaskId,
  specs,
  selectedSpecIndex,
  currentSpec,
  isSideBySide,
  isSearchingSpec = false,
  specSearchQuery = '',
  onSearchChange: _onSearchChange,
  onSearchSubmit: _onSearchSubmit,
  onSearchCancel: _onSearchCancel,
}) => {
  return (
    <Box
      flexDirection="column"
      width={isSideBySide ? '45%' : '100%'}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Box gap={1} flexShrink={1}>
          <Text bold color="yellow">
            Tasks ({tasks.length})
          </Text>
          {specs.length > 0 ? (
            <Box gap={1} flexShrink={1}>
              <Text color="yellow" bold>
                ● [{currentSpec}]
              </Text>
              {specs.length > 1 && (
                <Text dimColor>
                  ({selectedSpecIndex + 1}/{specs.length})
                </Text>
              )}
            </Box>
          ) : (
            <Text dimColor>• No Spec</Text>
          )}
        </Box>
        <Box flexShrink={0} gap={1}>
          <Text dimColor>[/] Search</Text>
          <Text dimColor>[←/→]</Text>
        </Box>
      </Box>

      {/* Spec Search Bar */}
      {isSearchingSpec && (
        <Box
          marginBottom={1}
          paddingX={1}
          borderStyle="single"
          borderColor="yellow"
          flexDirection="column"
        >
          <Box gap={1}>
            <Text bold color="yellow">Search:</Text>
            <Text color="white" bold>
              {specSearchQuery}█
            </Text>
          </Box>
          <Box justifyContent="flex-end">
            <Text dimColor>[Enter] Done  [Esc] Clear</Text>
          </Box>
        </Box>
      )}

      {tasks.length === 0 ? (
        <Box paddingY={2} justifyContent="center">
          <Text dimColor>No tasks found for spec "{currentSpec}".</Text>
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
                    <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
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
                    color={isSelected ? 'cyan' : 'white'}
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
