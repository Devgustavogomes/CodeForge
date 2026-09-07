export const DEFAULT_MAX_LOG_LINES = 1000;
export const MAX_LOG_LINES = 1000;
export const MAX_LINE_CHARS = 5000;

/**
 * Strips ANSI terminal escape sequences and normalizes line breaks.
 */
export function sanitizeLogChunk(chunk: string): string {
  return chunk
    .replace(/\x1b\[[0-9;]*[A-HJKSTf-n]/g, '')
    .replace(/\x1b\[\?[0-9]+[a-zA-Z]/g, '')
    .replace(/\x1b\([a-zA-Z]/g, '')
    .replace(/\r(?!\n)/g, '\n');
}

/**
 * Appends log chunks with sanitization, line length limiting, and ring-buffer capping.
 */
export function appendLogLines(
  existingLogs: string[] = [],
  chunk: string,
  maxLines: number = MAX_LOG_LINES,
): string[] {
  if (!chunk) return existingLogs;
  const sanitized = sanitizeLogChunk(chunk);
  const lines = sanitized
    .split(/\r?\n/)
    .map((l) =>
      l.length > MAX_LINE_CHARS ? l.slice(0, MAX_LINE_CHARS) + '...' : l,
    );

  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const combined = [...existingLogs, ...lines];
  return combined.length > maxLines
    ? combined.slice(combined.length - maxLines)
    : combined;
}

/**
 * Appends chunk to a specific taskId in a logs dictionary immutably.
 */
export function appendTaskLog(
  logs: Record<string, string[]>,
  taskId: string,
  chunk: string,
  maxLines: number = MAX_LOG_LINES,
): Record<string, string[]> {
  if (!chunk) return logs;
  return {
    ...logs,
    [taskId]: appendLogLines(logs[taskId] || [], chunk, maxLines),
  };
}
