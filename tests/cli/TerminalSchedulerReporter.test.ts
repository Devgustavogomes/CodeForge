import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalSchedulerReporter } from "../../src/cli/ui/TerminalSchedulerReporter.js";
import { formatSchedulerSnapshot } from "../../src/cli/ui/statusFormatter.js";
import type { StatusSnapshot } from "../../src/cli/ui/statusFormatter.js";

const startedAt = "2026-01-01T00:00:00.000Z";

function snapshot(): StatusSnapshot {
  return {
    kind: "status",
    intentName: "demo",
    intentStatus: "running",
    updatedAt: startedAt,
    tasks: [{
      id: "TASK-003",
      title: "Build feature",
      status: "running",
      startedAt,
      dependencies: ["TASK-001", "TASK-002"],
    }],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("TerminalSchedulerReporter", () => {
  it("updates elapsed time and running task duration every second, then stops", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(startedAt));
    const writes: string[] = [];
    const stream = { isTTY: true, write: (chunk: string) => { writes.push(chunk); return true; } };
    const reporter = new TerminalSchedulerReporter({
      getStatus: snapshot,
      stream: stream as unknown as NodeJS.WritableStream & { isTTY: boolean },
      interactive: true,
      color: false,
    });

    reporter.onStart("demo");
    expect(writes.join("")).toContain("Elapsed: 0ms");

    vi.advanceTimersByTime(2000);
    expect(writes.join("")).toContain("Elapsed: 1s");
    expect(writes.join("")).toContain("Elapsed: 2s");
    expect(writes.join("")).toContain("duration: 2s");

    reporter.onComplete("demo");
    const count = writes.length;
    vi.advanceTimersByTime(2000);
    expect(writes).toHaveLength(count);
  });

  it("keeps multiple dependencies on separate lines", () => {
    const output = formatSchedulerSnapshot(snapshot(), { color: false });
    const lines = output.split("\n");
    expect(lines.find((line) => line.includes("Build feature"))).not.toContain("depends on");
    expect(lines.filter((line) => line.includes("depends on"))).toEqual([
      "      [depends on: TASK-001]",
      "      [depends on: TASK-002]",
    ]);
  });

  it.each([
    ["en", "Reviewing completed tasks", "Run 'codeforge run demo'"],
    ["pt", "Revisando tarefas concluídas", "Execute 'codeforge run demo'"],
  ] as const)("announces AI review and new tasks in %s", (language, reviewing, rerun) => {
    const writes: string[] = [];
    const stream = { isTTY: true, write: (chunk: string) => { writes.push(chunk); return true; } };
    const reporter = new TerminalSchedulerReporter({
      getStatus: snapshot,
      stream: stream as unknown as NodeJS.WritableStream & { isTTY: boolean },
      interactive: true,
      color: false,
      language,
    });

    reporter.onStart("demo");
    reporter.onReviewStart("demo", { agent: "reviewer", round: 1, maxRounds: 3 });
    expect(writes.join("")).toContain(reviewing);
    reporter.onReviewEnd("demo", { outcome: "tasks_created", newTasksCount: 2, taskIds: ["TASK-004", "TASK-005"] });

    const output = writes.join("");
    expect(output).toContain("TASK-004, TASK-005");
    expect(output).toContain(rerun);
    expect(reporter.isFinished()).toBe(true);
    expect(reporter.isCursorHidden()).toBe(false);
  });
});
