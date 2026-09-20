import { describe, it, expect } from "vitest";
import {
  sanitizeLogChunk,
  appendLogLines,
  appendTaskLog,
  LogEventBuffer,
} from "../../../../src/cli/tui/context/ExecutionContext/logBuffer.js";

describe("logBuffer", () => {
  it("sanitizes ANSI escape codes and normalizes carriage returns", () => {
    const dirty = "\x1b[31mError:\x1b[0m Failed\r\x1b[2KNew line\r\n";
    const clean = sanitizeLogChunk(dirty);
    expect(clean).not.toContain("\x1b[31m");
    expect(clean).not.toContain("\x1b[0m");
    expect(clean).not.toContain("\x1b[2K");
    expect(clean).toContain("Error: Failed\nNew line\r\n");
  });

  it("removes terminal control sequences from agent output", () => {
    const output = "before\x1b]8;;https://example.com\x07link\x1b]8;;\x1b\\\x1b[?25l\x1b[2J\x08after";
    expect(sanitizeLogChunk(output)).toBe("beforelinkafter");
  });

  it("appends lines and truncates lines exceeding character limit", () => {
    const veryLong = "a".repeat(6000);
    const lines = appendLogLines([], veryLong, 10);
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBe(5003); // 5000 + "..."
    expect(lines[0].endsWith("...")).toBe(true);
  });

  it("enforces ring-buffer capacity by keeping only latest lines", () => {
    const existing = ["line 1", "line 2", "line 3"];
    const updated = appendLogLines(existing, "line 4\nline 5", 4);
    expect(updated).toEqual(["line 2", "line 3", "line 4", "line 5"]);
  });

  it("updates task log record with appendTaskLog", () => {
    const logs = appendTaskLog({}, "TASK-001", "Hello world\n");
    expect(logs["TASK-001"]).toEqual(["Hello world"]);
  });

  describe("LogEventBuffer", () => {
    it("queues multiple chunks and flushes them in order in a single batch", () => {
      const buffer = new LogEventBuffer(100);
      expect(buffer.hasPending()).toBe(false);

      buffer.append("TASK-001", "chunk 1\n");
      buffer.append("TASK-001", "chunk 2\n");
      buffer.append("TASK-001", "chunk 3\n");
      expect(buffer.hasPending()).toBe(true);

      const flushed = buffer.flush();
      expect(buffer.hasPending()).toBe(false);
      expect(flushed["TASK-001"]).toEqual(["chunk 1", "chunk 2", "chunk 3"]);

      // Calling flush again when empty returns current snapshot without changes
      expect(buffer.flush()).toEqual(flushed);
    });

    it("sanitizes ANSI escape sequences during flush", () => {
      const buffer = new LogEventBuffer(100);
      buffer.append("TASK-001", "\x1b[32mSuccess\x1b[0m\r\nSecond line");
      const flushed = buffer.flush();
      expect(flushed["TASK-001"]).toEqual(["Success", "Second line"]);
    });

    it("enforces ring-buffer capacity (maxLines) across multiple appends", () => {
      const buffer = new LogEventBuffer(3);
      buffer.append("TASK-001", "line 1\nline 2");
      buffer.append("TASK-001", "line 3\nline 4\nline 5");
      const flushed = buffer.flush();
      expect(flushed["TASK-001"]).toEqual(["line 3", "line 4", "line 5"]);
    });

    it("handles multiple tasks independently and supports clear", () => {
      const buffer = new LogEventBuffer(100);
      buffer.append("TASK-001", "task 1 log");
      buffer.append("TASK-002", "task 2 log");
      buffer.flush();

      expect(buffer.getTaskLogs("TASK-001")).toEqual(["task 1 log"]);
      expect(buffer.getTaskLogs("TASK-002")).toEqual(["task 2 log"]);

      buffer.clear("TASK-001");
      expect(buffer.getTaskLogs("TASK-001")).toEqual([]);
      expect(buffer.getTaskLogs("TASK-002")).toEqual(["task 2 log"]);

      buffer.clear();
      expect(buffer.getLogs()).toEqual({});
    });

    it("ignores empty or falsy chunks without marking pending", () => {
      const buffer = new LogEventBuffer(100);
      buffer.append("TASK-001", "");
      expect(buffer.hasPending()).toBe(false);
    });

    it("allows adjusting maxLines via setMaxLines and clamps existing logs", () => {
      const buffer = new LogEventBuffer(10);
      buffer.append("TASK-001", "1\n2\n3\n4\n5");
      buffer.flush();
      expect(buffer.getTaskLogs("TASK-001")).toHaveLength(5);

      buffer.setMaxLines(2);
      expect(buffer.getTaskLogs("TASK-001")).toEqual(["4", "5"]);
      expect(buffer.getMaxLines()).toBe(2);
    });
  });
});
