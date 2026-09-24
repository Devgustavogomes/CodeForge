import React from 'react';
import { Box, Text } from 'ink';
import { TaskStatus } from '../../../../../domain/execution.js';
import { TaskItem } from '../../../context/ExecutionContext/taskLoader.js';
import { Spinner } from '../../common/Spinner.js';
import { theme } from '../../../theme.js';
import { TaskRowDuration } from './TaskRowDuration.js';

export const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; color: string; label: string }
> = {
  pending: { icon: theme.status.pending.icon, color: theme.status.pending.color, label: 'Pending' },
  running: { icon: theme.status.running.icon, color: theme.status.running.color, label: 'Running' },
  completed: { icon: theme.status.completed.icon, color: theme.status.completed.color, label: 'Completed' },
  failed: { icon: theme.status.failed.icon, color: theme.status.failed.color, label: 'Failed' },
};

export interface TaskRowProps {
  task: TaskItem;
  isSelected: boolean;
  isFocused: boolean;
}

export function areTaskRowPropsEqual(prev: TaskRowProps, next: TaskRowProps): boolean {
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isFocused !== next.isFocused) return false;
  if (prev.task === next.task) return true;
  if (!prev.task || !next.task) return false;

  const p = prev.task;
  const n = next.task;
  return (
    p.id === n.id &&
    p.status === n.status &&
    p.title === n.title &&
    p.startedAt === n.startedAt &&
    p.completedAt === n.completedAt
  );
}

export const TaskRow: React.FC<TaskRowProps> = React.memo(({
  task,
  isSelected,
  isFocused,
}) => {
  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
  const isRunning = task.status === 'running';

  return (
    <Box justifyContent="space-between" width="100%">
      <Box gap={1} flexShrink={1}>
        {/* Modern vertical bar pointer when selected */}
        <Text color={isSelected ? (isFocused ? theme.colors.primary : theme.colors.text) : undefined} bold={isSelected}>
          {isSelected ? theme.symbols.pointer : ' '}
        </Text>

        {/* Status Icon or Spinner */}
        <Box flexShrink={0}>
          {isRunning ? (
            <Spinner color={theme.colors.primary} />
          ) : (
            <Text color={statusCfg.color}>
              {statusCfg.icon}
            </Text>
          )}
        </Box>

        {/* Task ID */}
        <Box flexShrink={0}>
          <Text bold={isSelected} color={isSelected ? theme.colors.text : theme.colors.muted}>
            {task.id}
          </Text>
        </Box>

        {/* Title (truncated if too long) */}
        <Text
          wrap="truncate-end"
          color={isSelected ? (isFocused ? theme.colors.primary : theme.colors.text) : theme.colors.text}
          bold={isSelected}
        >
          {task.title}
        </Text>
      </Box>

      {/* Duration */}
      <Box flexShrink={0} paddingLeft={1}>
        <TaskRowDuration
          status={task.status}
          startedAt={task.startedAt}
          completedAt={task.completedAt}
        />
      </Box>
    </Box>
  );
}, areTaskRowPropsEqual);

TaskRow.displayName = 'TaskRow';
