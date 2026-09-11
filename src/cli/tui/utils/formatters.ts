/**
 * Formats a duration in seconds into a human-readable string (e.g. '45s', '1m 24s', '2h 5m 10s').
 * Handles negative, NaN, or invalid values safely by returning '0s'.
 */
export function formatElapsedSeconds(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
    return '0s';
  }
  const totalSeconds = Math.floor(seconds);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Formats elapsed milliseconds into a human-readable string.
 * Values < 1000ms are rendered as e.g. '450ms', while >= 1000ms delegate to formatElapsedSeconds.
 */
export function formatElapsedMs(ms: number): string {
  if (isNaN(ms) || !isFinite(ms) || ms < 0) {
    return '0ms';
  }
  const floored = Math.floor(ms);
  if (floored < 1000) {
    return `${floored}ms`;
  }
  return formatElapsedSeconds(Math.floor(floored / 1000));
}

/**
 * Safely parses timestamps (string, number, or Date) into milliseconds epoch.
 * Returns null if the value is missing or invalid.
 */
function parseTimestamp(time?: string | number | Date | null): number | null {
  if (time === null || time === undefined || time === '') {
    return null;
  }
  if (typeof time === 'number') {
    return isNaN(time) || !isFinite(time) ? null : time;
  }
  if (time instanceof Date) {
    const ms = time.getTime();
    return isNaN(ms) ? null : ms;
  }
  const parsed = new Date(time).getTime();
  return isNaN(parsed) ? null : parsed;
}

/**
 * Pure function to format the duration between two timestamps (ISO string, Date, or epoch ms).
 * Returns '-' if either date is missing, invalid, or completedAt is prior to startedAt.
 */
export function formatDuration(
  startedAt?: string | number | Date | null,
  completedAt?: string | number | Date | null,
): string {
  const start = parseTimestamp(startedAt);
  const end = parseTimestamp(completedAt);

  if (start === null || end === null || end < start) {
    return '-';
  }

  return formatElapsedMs(end - start);
}

/**
 * Backward compatibility alias for formatElapsedSeconds.
 */
export const formatElapsedTime = formatElapsedSeconds;
