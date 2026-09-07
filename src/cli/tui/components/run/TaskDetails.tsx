import React from 'react';
import { Box, Text } from 'ink';
import { TaskItem, useExecution } from '../../context/ExecutionContext.js';
import { formatDuration, STATUS_CONFIG } from './TaskList.js';
import { theme } from '../../theme.js';

export interface TaskDetailsProps {
  task?: TaskItem | null;
  borderColor?: string;
  borderStyle?: 'round' | 'single' | 'none';
  compact?: boolean;
  maxFilesShown?: number;
  maxErrorLines?: number;
}

export function areTaskDetailsPropsEqual(
  prev: TaskDetailsProps,
  next: TaskDetailsProps
): boolean {
  if (prev.borderColor !== next.borderColor) return false;
  if (prev.borderStyle !== next.borderStyle) return false;
  if (prev.compact !== next.compact) return false;
  if (prev.maxFilesShown !== next.maxFilesShown) return false;
  if (prev.maxErrorLines !== next.maxErrorLines) return false;
  if (prev.task === next.task) return true;
  if (!prev.task || !next.task) return false;
  return (
    prev.task.id === next.task.id &&
    prev.task.status === next.task.status &&
    prev.task.title === next.task.title &&
    prev.task.startedAt === next.task.startedAt &&
    prev.task.completedAt === next.task.completedAt &&
    (prev.task.errors?.length ?? 0) === (next.task.errors?.length ?? 0)
  );
}

export const TaskDetails: React.FC<TaskDetailsProps> = React.memo(({
  task: propTask,
  borderColor,
  borderStyle = 'round',
  compact = false,
  maxFilesShown = 4,
  maxErrorLines = 4,
}) => {
  const exec = useExecution();
  const task = propTask !== undefined ? propTask : exec.selectedTask;

  const effectiveBorderColor =
    borderColor ??
    (task?.status === 'failed'
      ? 'red'
      : task?.status === 'running'
      ? 'cyan'
      : 'gray');

  if (!task) {
    return (
      <Box
        flexDirection="column"
        borderStyle={borderStyle === 'none' ? undefined : borderStyle}
        borderColor={borderStyle === 'none' ? undefined : 'gray'}
        paddingX={borderStyle === 'none' ? 0 : 1}
        width="100%"
      >
        <Text bold color="gray">
          Task Details
        </Text>
        <Box paddingY={0}>
          <Text dimColor>No task selected.</Text>
        </Box>
      </Box>
    );
  }

  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
  const duration = formatDuration(task.startedAt, task.completedAt);
  const files = task.files ?? [];
  const dependencies = task.dependencies ?? [];
  const errors = task.errors ?? [];

  const displayedFiles = files.slice(0, maxFilesShown);
  const remainingFilesCount = files.length - displayedFiles.length;

  // Ultra-compact header mode used in Run dashboard to maximize log space
  if (compact) {
    return (
      <Box flexDirection="column" width="100%" paddingX={0} paddingY={0} marginBottom={0}>
        <Box justifyContent="space-between" width="100%">
          <Box gap={1} flexShrink={1}>
            <Text bold color="cyan">
              {task.id}
            </Text>
            <Text color="gray">│</Text>
            <Text bold color="white" wrap="truncate-end">
              {task.title}
            </Text>
          </Box>
          <Box gap={1} flexShrink={0} paddingLeft={1}>
            <Text color={statusCfg.color} bold>
              [{task.status.toUpperCase()}]
            </Text>
            <Text color="gray">│</Text>
            <Text dimColor>{duration}</Text>
          </Box>
        </Box>

        {Boolean(task.objective) && (
          <Box marginTop={0}>
            <Text dimColor wrap="wrap">
              <Text color="gray">Objective: </Text>
              {task.objective}
            </Text>
          </Box>
        )}

        {errors.length > 0 && (
          <Box flexDirection="column" marginTop={0}>
            <Text color="red" bold>
              ✗ Error Diagnostic:
            </Text>
            {errors.slice(-maxErrorLines).map((err, idx) => (
              <Text key={idx} color="red" wrap="wrap">
                {err}
              </Text>
            ))}
          </Box>
        )}

        {errors.length === 0 && files.length > 0 && (
          <Box marginTop={0}>
            <Text dimColor wrap="truncate-end">
              <Text color="gray">Files ({files.length}): </Text>
              {displayedFiles.join(', ')}
              {remainingFilesCount > 0 ? ` (+${remainingFilesCount})` : ''}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // Full / Standalone mode
  const isNoneBorder = borderStyle === 'none';

  return (
    <Box
      flexDirection="column"
      borderStyle={isNoneBorder ? undefined : borderStyle}
      borderColor={isNoneBorder ? undefined : effectiveBorderColor}
      paddingX={isNoneBorder ? 0 : 1}
      width="100%"
    >
      {/* Title & Status Badge */}
      <Box justifyContent="space-between" width="100%">
        <Box gap={1} flexShrink={1}>
          <Text bold color="cyan">
            {task.id}
          </Text>
          <Text color="gray">│</Text>
          <Text bold color="white" wrap="wrap">
            {task.title}
          </Text>
        </Box>
        <Box flexShrink={0} paddingLeft={1}>
          <Text color={statusCfg.color} bold>
            [{task.status.toUpperCase()}]
          </Text>
        </Box>
      </Box>

      {/* Objective */}
      {Boolean(task.objective) && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          marginY={0}
        >
          <Text bold color="yellow">
            Objective:
          </Text>
          <Text color="white" wrap="wrap">
            {task.objective}
          </Text>
        </Box>
      )}

      {/* Dependencies & Timing Diagnostics */}
      <Box justifyContent="space-between" width="100%">
        <Box gap={1} flexShrink={1}>
          <Text bold color="blue">
            Deps:
          </Text>
          <Text color="gray" wrap="wrap">
            {dependencies.length > 0 ? dependencies.join(', ') : 'None'}
          </Text>
        </Box>

        <Box gap={1} flexShrink={0} paddingLeft={1}>
          <Text bold color="gray">
            Duration:
          </Text>
          <Text color="white">{duration}</Text>
          {task.startedAt && (
            <Text dimColor>
              ({new Date(task.startedAt).toLocaleTimeString()})
            </Text>
          )}
        </Box>
      </Box>

      {/* Files */}
      {files.length > 0 && (
        <Box flexDirection="column">
          <Text bold color="magenta">
            Files ({files.length}):
          </Text>
          {displayedFiles.map((file, idx) => (
            <Text key={idx} dimColor wrap="wrap">
              • {file}
            </Text>
          ))}
          {remainingFilesCount > 0 && (
            <Text dimColor>
              ...and {remainingFilesCount} more file{remainingFilesCount > 1 ? 's' : ''}
            </Text>
          )}
        </Box>
      )}

      {/* Error Tail */}
      {errors.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="red"
          backgroundColor="red"
          paddingX={1}
          marginTop={0}
        >
          <Text bold color="white">
            ✗ Error Diagnostic:
          </Text>
          {errors.slice(-maxErrorLines).map((err, idx) => (
            <Text key={idx} color="white" wrap="wrap">
              {err}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}, areTaskDetailsPropsEqual);

TaskDetails.displayName = 'TaskDetails';
