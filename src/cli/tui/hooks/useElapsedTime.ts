import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatElapsedSeconds as formatElapsedTime } from '../utils/formatters.js';

export { formatElapsedTime };

export interface UseElapsedTimeOptions {
  startTime?: string | number | Date | null;
  isRunning?: boolean;
  endTime?: string | number | Date | null;
}

export interface ElapsedTimeResult {
  seconds: number;
  elapsedSeconds: number;
  formatted: string;
}

function parseTimestamp(time?: string | number | Date | null): number | null {
  if (time === null || time === undefined || time === '') return null;
  if (typeof time === 'number') return isNaN(time) ? null : time;
  if (time instanceof Date) return isNaN(time.getTime()) ? null : time.getTime();
  const parsed = new Date(time).getTime();
  return isNaN(parsed) ? null : parsed;
}

export function useElapsedTime(
  optionsOrStartTime?: string | number | Date | null | UseElapsedTimeOptions,
  isRunningArg?: boolean,
  endTimeArg?: string | number | Date | null,
): ElapsedTimeResult {
  let startTime: string | number | Date | null | undefined;
  let isRunning = false;
  let endTime: string | number | Date | null | undefined;

  if (
    typeof optionsOrStartTime === 'object' &&
    optionsOrStartTime !== null &&
    !(optionsOrStartTime instanceof Date)
  ) {
    startTime = optionsOrStartTime.startTime;
    isRunning = optionsOrStartTime.isRunning ?? false;
    endTime = optionsOrStartTime.endTime;
  } else {
    startTime = optionsOrStartTime;
    isRunning = isRunningArg ?? false;
    endTime = endTimeArg;
  }

  const startMs = parseTimestamp(startTime);
  const endMs = parseTimestamp(endTime);

  const calculateElapsed = useCallback(() => {
    if (!startMs) return 0;
    if (endMs !== null) {
      return Math.max(0, Math.floor((endMs - startMs) / 1000));
    }
    return Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  }, [startMs, endMs]);

  const [seconds, setSeconds] = useState<number>(() => calculateElapsed());

  useEffect(() => {
    setSeconds(calculateElapsed());

    if (!isRunning || !startMs || endMs !== null) {
      return;
    }

    const timer = setInterval(() => {
      setSeconds(calculateElapsed());
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, startMs, endMs, calculateElapsed]);

  const formatted = useMemo(() => formatElapsedTime(seconds), [seconds]);

  return {
    seconds,
    elapsedSeconds: seconds,
    formatted,
  };
}

export default useElapsedTime;
