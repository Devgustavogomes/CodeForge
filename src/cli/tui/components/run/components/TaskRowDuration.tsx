import React from 'react';
import { Text } from 'ink';
import { TaskStatus } from '../../../../../domain/execution.js';
import { useElapsedTime } from '../../../hooks/useElapsedTime.js';
import { formatDuration } from '../../../utils/formatters.js';

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