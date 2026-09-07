import React from 'react';
import { Box, Text } from 'ink';
import { TaskItem, useExecution } from '../../context/ExecutionContext.js';
import { formatDuration, STATUS_CONFIG } from './TaskList.js';

export interface TaskDetailsProps {
  task?: TaskItem | null;
  borderColor?: string;
  maxFilesShown?: number;
  maxErrorLines?: number;
}

export const TaskDetails: React.FC<TaskDetailsProps> = ({
  task: propTask,
  borderColor,
  maxFilesShown = 4,
  maxErrorLines = 4,
}) => {
  let execSelectedTask: TaskItem | null = null;
  try {
    const exec = useExecution();
    execSelectedTask = exec.selectedTask;
  } catch {
    // Outside ExecutionProvider
  }

  const task = propTask !== undefined ? propTask : execSelectedTask;

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
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        width="100%"
      >
        <Text bold color="gray">
          Task Details
        </Text>
        <Box paddingY={1}>
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

  // Files to display with truncation if list is long
  const displayedFiles = files.slice(0, maxFilesShown);
  const remainingFilesCount = files.length - displayedFiles.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={effectiveBorderColor}
      paddingX={1}
      width="100%"
    >
      {/* Title & Status Badge */}
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
        <Box flexShrink={0} paddingLeft={1}>
          <Text color={statusCfg.color} bold>
            [{task.status.toUpperCase()}]
          </Text>
        </Box>
      </Box>

      {/* Objective */}
      {Boolean(task.objective) && (
        <Box gap={1}>
          <Text bold color="yellow">
            Objective:
          </Text>
          <Text color="white" wrap="truncate-end">
            {task.objective}
          </Text>
        </Box>
      )}

      {/* Dependencies & Timing Diagnostics */}
      <Box justifyContent="space-between">
        <Box gap={1} flexShrink={1}>
          <Text bold color="blue">
            Deps:
          </Text>
          <Text color="gray" wrap="truncate-end">
            {dependencies.length > 0 ? dependencies.join(', ') : 'None'}
          </Text>
        </Box>

        <Box gap={1} flexShrink={0} paddingLeft={1}>
          <Text bold color="gray">
            Duration:
          </Text>
          <Text color="white">{duration}</Text>
        </Box>
      </Box>

      {/* Diagnostic Timestamps */}
      {(task.startedAt || task.completedAt) && (
        <Box gap={2}>
          {task.startedAt && (
            <Text dimColor>
              Started: {new Date(task.startedAt).toLocaleTimeString()}
            </Text>
          )}
          {task.completedAt && (
            <Text dimColor>
              Ended: {new Date(task.completedAt).toLocaleTimeString()}
            </Text>
          )}
        </Box>
      )}

      {/* Files */}
      {files.length > 0 && (
        <Box flexDirection="column">
          <Text bold color="magenta">
            Files ({files.length}):
          </Text>
          {displayedFiles.map((file, idx) => (
            <Text key={idx} dimColor wrap="truncate-end">
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
          borderStyle="single"
          borderColor="red"
          paddingX={1}
          marginTop={1}
        >
          <Text bold color="red">
            ✗ Error Diagnostic:
          </Text>
          {errors.slice(-maxErrorLines).map((err, idx) => (
            <Text key={idx} color="red" wrap="truncate-end">
              {err}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
