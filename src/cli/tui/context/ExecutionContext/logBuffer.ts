/* eslint-disable no-control-regex */
export const DEFAULT_MAX_LOG_LINES = 1000;
export const MAX_LOG_LINES = 1000;
export const MAX_LINE_CHARS = 5000;

/**
 * Strips ANSI terminal escape sequences and normalizes line breaks.
 */
export function sanitizeLogChunk(chunk: string): string {
  return chunk
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][0-9A-Za-z]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
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

/**
 * Buffer for batching log chunks per task before flushing to React state.
 */
export class LogEventBuffer {
  private maxLines: number;
  private logs: Record<string, string[]>;
  private pendingQueue: Map<string, string[]>;

  constructor(
    maxLines: number = DEFAULT_MAX_LOG_LINES,
    initialLogs: Record<string, string[]> = {},
  ) {
    this.maxLines = maxLines;
    this.logs = { ...initialLogs };
    this.pendingQueue = new Map();
  }

  /**
   * Enqueues a log chunk for the specified taskId.
   */
  append(taskId: string, chunk: string): void {
    if (!chunk) return;
    const queue = this.pendingQueue.get(taskId);
    if (queue) {
      queue.push(chunk);
    } else {
      this.pendingQueue.set(taskId, [chunk]);
    }
  }

  /**
   * Returns true if there are pending chunks waiting to be flushed.
   */
  hasPending(): boolean {
    return this.pendingQueue.size > 0;
  }

  /**
   * Flushes all pending chunks in batch, applying sanitization and ring-buffer capping,
   * and returns a consolidated snapshot of logs.
   */
  flush(): Record<string, string[]> {
    if (this.pendingQueue.size > 0) {
      for (const [taskId, chunks] of this.pendingQueue.entries()) {
        let current = this.logs[taskId] || [];
        for (const chunk of chunks) {
          current = appendLogLines(current, chunk, this.maxLines);
        }
        this.logs[taskId] = current;
      }
      this.pendingQueue.clear();
    }
    return { ...this.logs };
  }

  /**
   * Clears logs and pending chunks for a specific taskId or for all tasks.
   */
  clear(taskId?: string): void {
    if (taskId) {
      delete this.logs[taskId];
      this.pendingQueue.delete(taskId);
    } else {
      this.logs = {};
      this.pendingQueue.clear();
    }
  }

  /**
   * Returns current consolidated logs snapshot.
   */
  getLogs(): Record<string, string[]> {
    return { ...this.logs };
  }

  private static readonly EMPTY_LOGS: string[] = [];

  /**
   * Returns log lines for a specific taskId.
   */
  getTaskLogs(taskId: string): string[] {
    return this.logs[taskId] || LogEventBuffer.EMPTY_LOGS;
  }

  /**
   * Sets maxLines capacity and trims existing logs if needed.
   */
  setMaxLines(maxLines: number): void {
    this.maxLines = maxLines;
    for (const taskId of Object.keys(this.logs)) {
      if (this.logs[taskId].length > maxLines) {
        this.logs[taskId] = this.logs[taskId].slice(this.logs[taskId].length - maxLines);
      }
    }
  }

  getMaxLines(): number {
    return this.maxLines;
  }
}
