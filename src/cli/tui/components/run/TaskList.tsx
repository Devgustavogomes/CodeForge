import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { TaskStatus } from '../../../../domain/execution.js';
import { TaskItem, useExecution } from '../../context/ExecutionContext.js';
import { Spinner } from '../common/Spinner.js';
import { useElapsedTime } from '../../hooks/useElapsedTime.js';
import { theme } from '../../theme.js';

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
  borderColor?: string;
  borderStyle?: 'round' | 'single' | 'none';
}

export const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; color: string; label: string }
> = {
  pending: { icon: '●', color: 'gray', label: 'Pending' },
  running: { icon: '▶', color: 'cyan', label: 'Running' },
  completed: { icon: '✓', color: 'green', label: 'Completed' },
  failed: { icon: '✗', color: 'red', label: 'Failed' },
};

export function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (isNaN(start) || isNaN(end) || end < start) return '-';

  const diff = end - start;
  if (diff < 1000) return `${diff}ms`;
  const totalSeconds = Math.floor(diff / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export interface TaskRowProps {
  task: TaskItem;
  isSelected: boolean;
  isFocused: boolean;
}

export interface TaskRowDurationProps {
  status: TaskStatus;
  startedAt?: string;
  completedAt?: string;
}

export const TaskRowDuration: React.FC<TaskRowDurationProps> = React.memo(({
  status,
  startedAt,
  completedAt,
}) => {
  const isRunning = status === 'running';

  const { formatted: runningElapsed } = useElapsedTime({
    startTime: startedAt,
    isRunning,
  });

  const duration = isRunning
    ? (startedAt ? runningElapsed : '-')
    : formatDuration(startedAt, completedAt);

  return <Text dimColor>{duration}</Text>;
});
TaskRowDuration.displayName = 'TaskRowDuration';

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
        <Text color={isSelected ? (isFocused ? 'cyan' : 'white') : undefined} bold={isSelected}>
          {isSelected ? theme.symbols.pointer : ' '}
        </Text>

        {/* Status Icon or Spinner */}
        <Box flexShrink={0}>
          {isRunning ? (
            <Spinner color="cyan" />
          ) : (
            <Text color={statusCfg.color}>
              {statusCfg.icon}
            </Text>
          )}
        </Box>

        {/* Task ID */}
        <Box flexShrink={0}>
          <Text bold={isSelected} color={isSelected ? 'white' : 'gray'}>
            {task.id}
          </Text>
        </Box>

        {/* Title (truncated if too long) */}
        <Text
          wrap="truncate-end"
          color={isSelected ? (isFocused ? 'cyan' : 'white') : 'white'}
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
      if (!isFocused || filteredTasks.length === 0) return;

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

      // Filter cycling with 'f'
      if (input === 'f') {
        const filters: TaskFilter[] = ['all', 'running', 'failed', 'completed', 'pending'];
        const currentIdx = filters.indexOf(currentFilter);
        const nextFilter = filters[(currentIdx + 1) % filters.length]!;
        setFilter(nextFilter);
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
