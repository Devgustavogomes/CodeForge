import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { TaskStatus } from '../../../../domain/execution.js';
import { TaskItem, useExecution } from '../../context/ExecutionContext.js';

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
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks: propTasks,
  selectedTaskId: propSelectedTaskId,
  onSelectTask: propOnSelectTask,
  isFocused = true,
  maxHeight,
  showFilterBadges = true,
  filter: propFilter,
  onFilterChange,
  borderColor,
}) => {
  let execTasks: TaskItem[] = [];
  let execSelectedTaskId: string | null = null;
  let execSelectTask: ((id: string | null) => void) | undefined;

  try {
    const exec = useExecution();
    execTasks = exec.tasks;
    execSelectedTaskId = exec.selectedTaskId;
    execSelectTask = exec.selectTask;
  } catch {
    // Outside ExecutionProvider
  }

  const tasks = propTasks ?? execTasks;
  const selectedTaskId = propSelectedTaskId !== undefined ? propSelectedTaskId : execSelectedTaskId;
  const onSelectTask = propOnSelectTask ?? execSelectTask;

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

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={effectiveBorderColor}
      paddingX={1}
      width="100%"
      flexGrow={1}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={showFilterBadges ? 0 : 1}>
        <Text bold color={isFocused ? 'cyan' : 'gray'}>
          {isFocused ? '● ' : '  '}Tasks ({tasks.length})
        </Text>
        {isFocused ? (
          <Text dimColor color="cyan">[Tab] Switch to Logs</Text>
        ) : (
          <Text dimColor>[Tab] Focus</Text>
        )}
      </Box>

      {/* Filter Badges */}
      {showFilterBadges && (
        <Box gap={1} marginY={1} flexWrap="wrap">
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
        <Box flexDirection="column">
          {visibleTasks.map((task) => {
            const isSelected = task.id === selectedTaskId;
            const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
            const duration = formatDuration(task.startedAt, task.completedAt);

            return (
              <Box key={task.id} justifyContent="space-between" width="100%">
                <Box gap={1} flexShrink={1}>
                  {/* Selected pointer */}
                  <Text color={isSelected ? (isFocused ? 'cyan' : 'white') : undefined} bold={isSelected}>
                    {isSelected ? '❯' : ' '}
                  </Text>

                  {/* Status Icon */}
                  <Text color={statusCfg.color} bold={task.status === 'running'}>
                    {statusCfg.icon}
                  </Text>

                  {/* Task ID */}
                  <Text bold={isSelected} color={isSelected ? 'white' : 'gray'}>
                    {task.id}
                  </Text>

                  {/* Title (truncated if too long) */}
                  <Text
                    wrap="truncate-end"
                    color={isSelected ? 'cyan' : 'white'}
                    bold={isSelected}
                  >
                    {task.title}
                  </Text>
                </Box>

                {/* Duration */}
                <Box flexShrink={0} paddingLeft={1}>
                  <Text dimColor>{duration}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
