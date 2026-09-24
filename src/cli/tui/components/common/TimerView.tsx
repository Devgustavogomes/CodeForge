import React, { memo } from 'react';
import { Text } from 'ink';
import { useElapsedTime } from '../../hooks/useElapsedTime.js';

export interface TimerViewProps {
  startTime?: string | number | Date | null;
  isRunning?: boolean;
  endTime?: string | number | Date | null;
  prefix?: string;
  color?: string;
}

export const TimerView: React.FC<TimerViewProps> = memo(({
  startTime,
  isRunning = true,
  endTime,
  prefix = '',
  color,
}) => {
  const { formatted } = useElapsedTime({
    startTime,
    isRunning,
    endTime,
  });

  return (
    <Text color={color}>
      {prefix}{formatted}
    </Text>
  );
});

TimerView.displayName = 'TimerView';

export default TimerView;
