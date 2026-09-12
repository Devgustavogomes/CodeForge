import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { TaskItem, useExecution } from '../../context/ExecutionContext.js';
import { TaskRow, areTaskRowPropsEqual, TaskRowProps, STATUS_CONFIG } from './components/TaskRow.js';
import { TaskRowDuration, TaskRowDurationProps } from './components/TaskRowDuration.js';
import { formatDuration } from '../../utils/formatters.js';

export {
  TaskRow,
  areTaskRowPropsEqual,
  TaskRowProps,
  STATUS_CONFIG,
  TaskRowDuration,
  TaskRowDurationProps,
  formatDuration,
};

export type TaskFilter = 'all' | 'running' | 'failed' | 'completed' | 'pending';

export interface TaskListProps {
  tasks?: TaskItem[];
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string) => void;
  isFocused?: boolean;
  maxHeight?: number;
  showFilterBadges?: boolean;
  filter?: TaskFilter;
  onFilterChange?: (filter: TaskFilter) => void;
  onCompleteTask?: () => void;
  borderColor?: string;
  borderStyle?: 'round' | 'single' | 'none';
}

export function areTaskListPropsEqual(prev: TaskListProps, next: TaskListProps): boolean {
  if (prev.isFocused !== next.isFocused) return false;
  if (prev.selectedTaskId !== next.selectedTaskId) return false;
  if (prev.maxHeight !== next.maxHeight) return false;
  if (prev.showFilterBadges !== next.showFilterBadges) return false;
  if (prev.filter !== next.filter) return false;
  if (prev.borderColor !== next.borderColor) return false;
  if (prev.borderStyle !== next.borderStyle) return false;
  if (prev.onSelectTask !== next.onSelectTask) return false;
  if (prev.onFilterChange !== next.onFilterChange) return false;
  if (prev.onCompleteTask !== next.onCompleteTask) return false;
  if (prev.tasks === next.tasks) return true;
  if (!prev.tasks || !next.tasks) return false;
  if (prev.tasks.length !== next.tasks.length) return false;
  for (let i = 0; i < prev.tasks.length; i++) {
    const p = prev.tasks[i]!;
    const n = next.tasks[i]!;
    if (
      p.id !== n.id ||
      p.status !== n.status ||
      p.title !== n.title ||
      p.startedAt !== n.startedAt ||
      p.completedAt !== n.completedAt
    ) {
      return false;
    }
  }
  return true;
}

export const TaskList: React.FC<TaskListProps> = React.memo(({
  tasks: propTasks,
  selectedTaskId: propSelectedTaskId,
  onSelectTask: propOnSelectTask,
  isFocused = true,
  maxHeight,
  showFilterBadges = true,
  filter: propFilter,
  onFilterChange,
  onCompleteTask,
  borderColor,
  borderStyle = 'round',
}) => {
  const exec = useExecution();
  const tasks = propTasks ?? exec.tasks;
  const selectedTaskId = propSelectedTaskId !== undefined ? propSelectedTaskId : exec.selectedTaskId;
  const onSelectTask = propOnSelectTask ?? exec.selectTask;

  const [internalFilter, setInternalFilter] = useState<TaskFilter>('all');
  const currentFilter = propFilter ?? internalFilter;

  const setFilter = (nextFilter: TaskFilter) => {
    if (onFilterChange) {
      onFilterChange(nextFilter);
    } else {
      setInternalFilter(nextFilter);
    }
  };

  const counts = useMemo(() => {
    const total = tasks.length;
    let pending = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    for (const t of tasks) {
      if (t.status === 'pending') pending++;
      else if (t.status === 'running') running++;
      else if (t.status === 'completed') completed++;
      else if (t.status === 'failed') failed++;
    }
    return { total, pending, running, completed, failed };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (currentFilter === 'all') return tasks;
    return tasks.filter((t) => t.status === currentFilter);
  }, [tasks, currentFilter]);

  // Keyboard navigation: ↑/↓ and j/k, plus 'f' to cycle filter if focused
  useInput(
    (input, key) => {
      if (!isFocused) return;

      // Keep filtering available on empty results so the user can cycle back.
      if (input === 'f') {
        const filters: TaskFilter[] = ['all', 'running', 'failed', 'completed', 'pending'];
        const currentIdx = filters.indexOf(currentFilter);
        const nextFilter = filters[(currentIdx + 1) % filters.length]!;
        setFilter(nextFilter);
        return;
      }

      if (filteredTasks.length === 0) return;

      const currentIndex = filteredTasks.findIndex((t) => t.id === selectedTaskId);

      if (key.upArrow || input === 'k') {
        const nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
        const nextTask = filteredTasks[nextIndex];
        if (nextTask && onSelectTask) {
          onSelectTask(nextTask.id);
        }
        return;
      }

      if (key.downArrow || input === 'j') {
        const nextIndex =
          currentIndex < 0
            ? 0
            : currentIndex >= filteredTasks.length - 1
            ? filteredTasks.length - 1
            : currentIndex + 1;
        const nextTask = filteredTasks[nextIndex];
        if (nextTask && onSelectTask) {
          onSelectTask(nextTask.id);
        }
        return;
      }

      if (input === 'c' && selectedTaskId) {
        onCompleteTask?.();
        return;
      }
    },
    { isActive: isFocused }
  );

  // Auto-select first task if current selectedTaskId not in list
  useEffect(() => {
    if (filteredTasks.length > 0 && (!selectedTaskId || !filteredTasks.some((t) => t.id === selectedTaskId))) {
      onSelectTask?.(filteredTasks[0]!.id);
    }
  }, [filteredTasks, selectedTaskId, onSelectTask]);

  // Windowed list slicing if maxHeight provided
  const visibleTasks = useMemo(() => {
    if (!maxHeight || maxHeight <= 0 || filteredTasks.length <= maxHeight) {
      return filteredTasks;
    }

    const selectedIndex = Math.max(
      0,
      filteredTasks.findIndex((t) => t.id === selectedTaskId)
    );

    let start = Math.max(0, selectedIndex - Math.floor(maxHeight / 2));
    if (start + maxHeight > filteredTasks.length) {
      start = Math.max(0, filteredTasks.length - maxHeight);
    }

    return filteredTasks.slice(start, start + maxHeight);
  }, [filteredTasks, maxHeight, selectedTaskId]);

  const effectiveBorderColor = borderColor ?? (isFocused ? 'cyan' : 'gray');
  const isNoneBorder = borderStyle === 'none';

  return (
    <Box
      flexDirection="column"
      borderStyle={isNoneBorder ? undefined : borderStyle}
      borderColor={isNoneBorder ? undefined : effectiveBorderColor}
      paddingX={isNoneBorder ? 0 : 1}
      width="100%"
      flexGrow={1}
    >
      {/* Header */}
      <Box justifyContent="space-between" width="100%" marginBottom={0}>
        <Box flexShrink={0}>
          <Text bold color={isFocused ? 'cyan' : 'gray'}>
            {isFocused ? '● ' : '  '}Tasks ({tasks.length})
          </Text>
        </Box>
        <Box flexShrink={1} paddingLeft={1}>
          {isFocused ? (
            <Text dimColor color="cyan" wrap="truncate-end">[Tab] Logs</Text>
          ) : (
            <Text dimColor wrap="truncate-end">[Tab] Focus</Text>
          )}
        </Box>
      </Box>

      {/* Filter Badges */}
      {showFilterBadges && (
        <Box gap={1} marginY={0} flexWrap="wrap">
          <Text
            color={currentFilter === 'all' ? 'cyan' : 'gray'}
            bold={currentFilter === 'all'}
          >
            [All: {counts.total}]
          </Text>
          <Text
            color={currentFilter === 'running' ? 'cyan' : 'gray'}
            bold={currentFilter === 'running'}
          >
            [▶ Running: {counts.running}]
          </Text>
          <Text
            color={currentFilter === 'failed' ? 'red' : 'gray'}
            bold={currentFilter === 'failed'}
          >
            [✗ Failed: {counts.failed}]
          </Text>
          <Text
            color={currentFilter === 'completed' ? 'green' : 'gray'}
            bold={currentFilter === 'completed'}
          >
            [✓ Done: {counts.completed}]
          </Text>
        </Box>
      )}

      {/* Task Items */}
      {filteredTasks.length === 0 ? (
        <Box paddingY={1}>
          <Text dimColor>No tasks found{currentFilter !== 'all' ? ` for filter '${currentFilter}'` : ''}.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={0}>
          {visibleTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isSelected={task.id === selectedTaskId}
              isFocused={isFocused}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}, areTaskListPropsEqual);

TaskList.displayName = 'TaskList';
