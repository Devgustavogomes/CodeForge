import { describe, expect, it, vi } from "vitest";
import { TerminalSchedulerReporter } from "../../../src/cli/ui/TerminalSchedulerReporter.js";
import { IntentStatusResult } from "../../../src/application/use-cases/GetIntentStatusUseCase.js";

function createMockStream(isTTY = false) {
  let output = "";
  return {
    isTTY,
    write: vi.fn((chunk: string) => {
      output += chunk;
      return true;
    }),
    getOutput: () => output,
  };
}

const mockStatusSnapshot: IntentStatusResult = {
  kind: "status",
  intentName: "auth-intent",
  intentStatus: "running",
  tasks: [
    {
      id: "TASK-001",
      title: "Create DB schema",
      status: "completed",
      dependencies: [],
      startedAt: "2026-01-01T10:00:00.000Z",
      completedAt: "2026-01-01T10:00:05.000Z",
    },
    {
      id: "TASK-002",
      title: "Add auth route",
      status: "running",
      dependencies: ["TASK-001"],
      startedAt: "2026-01-01T10:00:05.000Z",
    },
    {
      id: "TASK-003",
      title: "Write integration tests",
      status: "failed",
      dependencies: ["TASK-001", "TASK-002"],
      startedAt: "2026-01-01T10:00:08.000Z",
      completedAt: "2026-01-01T10:00:09.000Z",
      errors: ["JWT secret missing", "Unauthorized 401"],
    },
    {
      id: "TASK-004",
      title: "Deploy service",
      status: "pending",
      dependencies: ["TASK-003"],
    },
  ],
  updatedAt: "2026-01-01T10:00:15.000Z",
};

describe("TerminalSchedulerReporter", () => {
  it("renders lifecycle snapshots with elapsed header, progress bar, 4 counts, tasks, dependencies, timing, and errors", () => {
    const stream = createMockStream(false);
    let currentTime = 1000;
    const reporter = new TerminalSchedulerReporter({
      getStatus: () => mockStatusSnapshot,
      stream: stream as any,
      clock: () => currentTime,
      color: false,
      interactive: false,
    });

    reporter.onStart("auth-intent");

    currentTime = 6000; // 5 seconds elapsed
    reporter.onUpdate("auth-intent");

    const output = stream.getOutput();

    // Elapsed header
    expect(output).toContain("Intent: auth-intent | Elapsed: 5s");
    // Progress bar
    expect(output).toContain("Progress: 1/4 tasks completed (25%)");
    expect(output).toContain("[█████░░░░░░░░░░░░░░░]");
    // 4 counts
    expect(output).toContain("Summary: 1 completed, 1 running, 1 failed, 1 pending");
    // Task list and icons
    expect(output).toContain("[✓] TASK-001: Create DB schema (completed)");
    expect(output).toContain("[▶] TASK-002: Add auth route (running)");
    expect(output).toContain("[✗] TASK-003: Write integration tests (failed)");
    expect(output).toContain("[○] TASK-004: Deploy service (pending)");
    // Dependencies & durations
    expect(output).toContain("depends on: TASK-001");
    expect(output).toContain("depends on: TASK-001, TASK-002");
    expect(output).toContain("duration: 5s");
    expect(output).toContain("duration: 1s");
    // Task errors
    expect(output).toContain("Error: JWT secret missing");
    expect(output).toContain("Error: Unauthorized 401");
  });

  it("supports GetIntentStatusUseCase object with execute method as getStatus", () => {
    const stream = createMockStream(false);
    const mockUseCase = {
      execute: vi.fn().mockReturnValue(mockStatusSnapshot),
    };
    const reporter = new TerminalSchedulerReporter({
      getStatus: mockUseCase as any,
      stream: stream as any,
      clock: () => 1000,
      color: false,
      interactive: false,
    });

    reporter.onStart("auth-intent");

    expect(mockUseCase.execute).toHaveBeenCalledWith("auth-intent");
    expect(stream.getOutput()).toContain("Intent: auth-intent | Elapsed: 0ms");
  });

  it("renders onComplete with final snapshot and localized success message", () => {
    const stream = createMockStream(false);
    let currentTime = 1000;
    const completedSnapshot: IntentStatusResult = {
      ...mockStatusSnapshot,
      intentStatus: "completed",
    };

    const reporter = new TerminalSchedulerReporter({
      getStatus: () => completedSnapshot,
      stream: stream as any,
      clock: () => currentTime,
      color: false,
      interactive: false,
    });

    reporter.onStart("auth-intent");
    currentTime = 16000; // 15s elapsed
    reporter.onComplete("auth-intent");

    const output = stream.getOutput();
    expect(output).toContain("Execution of intent 'auth-intent' completed in 15s.");
  });

  it("renders onFail with final snapshot and localized failure message", () => {
    const stream = createMockStream(false);
    let currentTime = 2000;
    const reporter = new TerminalSchedulerReporter({
      getStatus: () => mockStatusSnapshot,
      stream: stream as any,
      clock: () => currentTime,
      color: false,
      interactive: false,
    });

    reporter.onStart("auth-intent");
    currentTime = 12000; // 10s elapsed
    reporter.onFail("auth-intent");

    const output = stream.getOutput();
    expect(output).toContain("Execution of intent 'auth-intent' failed after 10s.");
  });

  it("renders onDeadlock with final snapshot and localized deadlock message", () => {
    const stream = createMockStream(false);
    const reporter = new TerminalSchedulerReporter({
      getStatus: () => mockStatusSnapshot,
      stream: stream as any,
      clock: () => 1000,
      color: false,
      interactive: false,
    });

    reporter.onStart("auth-intent");
    reporter.onDeadlock("auth-intent");

    const output = stream.getOutput();
    expect(output).toContain(
      "Execution stopped because intent 'auth-intent' has a dependency deadlock.",
    );
  });

  it("renders onError with specific error or localized no-tasks message", () => {
    const stream = createMockStream(false);
    const reporter = new TerminalSchedulerReporter({
      getStatus: () => undefined,
      stream: stream as any,
      color: false,
      interactive: false,
    });

    reporter.onError(new Error("No tasks found for intent: empty-intent"));
    expect(stream.getOutput()).toContain("No tasks found for intent 'empty-intent'.");

    reporter.onError(new Error("Connection to runner timed out"));
    expect(stream.getOutput()).toContain("Execution error: Connection to runner timed out");
  });

  it("manages cursor visibility and cleanup in interactive mode", () => {
    const stream = createMockStream(true);
    const reporter = new TerminalSchedulerReporter({
      getStatus: () => mockStatusSnapshot,
      stream: stream as any,
      clock: () => 1000,
      color: false,
      interactive: true,
    });

    expect(reporter.isCursorHidden()).toBe(false);

    reporter.onStart("auth-intent");
    // Cursor hidden
    expect(stream.write).toHaveBeenCalledWith("\x1b[?25l");
    expect(reporter.isCursorHidden()).toBe(true);

    // On update, cursor moves up and clears
    reporter.onUpdate("auth-intent");
    const escape = String.fromCharCode(27);
    expect(stream.write).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`${escape}\\[\\d+A${escape}\\[0J`)));

    // On complete, terminal is cleaned up and cursor restored
    reporter.onComplete("auth-intent");
    expect(stream.write).toHaveBeenCalledWith("\x1b[?25h");
    expect(reporter.isCursorHidden()).toBe(false);
  });

  it("does not output ANSI cursor codes when non-interactive", () => {
    const stream = createMockStream(false);
    const reporter = new TerminalSchedulerReporter({
      getStatus: () => mockStatusSnapshot,
      stream: stream as any,
      clock: () => 1000,
      color: false,
      interactive: false,
    });

    reporter.onStart("auth-intent");
    reporter.onUpdate("auth-intent");
    reporter.onComplete("auth-intent");

    const output = stream.getOutput();
    expect(output).not.toContain("\x1b[?25l");
    expect(output).not.toContain("\x1b[?25h");
    expect(output).not.toMatch(new RegExp(`${String.fromCharCode(27)}\\[\\d+A`));
  });

  it("formats localized output in Portuguese and Spanish", () => {
    const streamPt = createMockStream(false);
    const reporterPt = new TerminalSchedulerReporter({
      getStatus: () => mockStatusSnapshot,
      stream: streamPt as any,
      clock: () => 1000,
      color: false,
      interactive: false,
      language: "pt",
    });

    reporterPt.onStart("auth-intent");
    reporterPt.onComplete("auth-intent");
    const outputPt = streamPt.getOutput();

    expect(outputPt).toContain("Intent: auth-intent | Tempo decorrido: 0ms");
    expect(outputPt).toContain("Progresso: 1/4 tarefas concluídas (25%)");
    expect(outputPt).toContain("Resumo: 1 concluídas, 1 em execução, 1 com falha, 1 pendentes");
    expect(outputPt).toContain("Execução da intenção 'auth-intent' concluída em 0ms.");

    const streamEs = createMockStream(false);
    const reporterEs = new TerminalSchedulerReporter({
      getStatus: () => mockStatusSnapshot,
      stream: streamEs as any,
      clock: () => 1000,
      color: false,
      interactive: false,
      language: "es",
    });

    reporterEs.onStart("auth-intent");
    reporterEs.onFail("auth-intent");
    const outputEs = streamEs.getOutput();

    expect(outputEs).toContain("Intent: auth-intent | Tiempo transcurrido: 0ms");
    expect(outputEs).toContain("Progreso: 1/4 tareas completadas (25%)");
    expect(outputEs).toContain("La ejecución de la intención 'auth-intent' falló después de 0ms.");
  });

  describe("printLine helper for live snapshot coordination", () => {
    it("clears snapshot, prints line, and re-renders snapshot in interactive mode", () => {
      const stream = createMockStream(true);
      const reporter = new TerminalSchedulerReporter({
        getStatus: () => mockStatusSnapshot,
        stream: stream as any,
        color: false,
        interactive: true,
      });

      reporter.onStart("auth-intent");
      // Initially, snapshot is rendered
      expect(stream.write).toHaveBeenCalledWith("\x1b[?25l");

      // Now call printLine while snapshot is active
      reporter.printLine("▶ [hook] Executing 'lint' (task.verify): npm run lint");

      const output = stream.getOutput();
      expect(output).toContain("▶ [hook] Executing 'lint' (task.verify): npm run lint\n");

      // Verify ANSI cursor clearing code was sent before writing the hook line
      const escape = String.fromCharCode(27);
      expect(stream.write).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`${escape}\\[\\d+A${escape}\\[0J`)),
      );

      // Verify snapshot was re-rendered below the printed line
      expect(output).toContain("Intent: auth-intent | Elapsed: 0ms");
    });

    it("writes formatted text directly in non-interactive mode without cursor repositioning", () => {
      const stream = createMockStream(false);
      const reporter = new TerminalSchedulerReporter({
        getStatus: () => mockStatusSnapshot,
        stream: stream as any,
        color: false,
        interactive: false,
      });

      reporter.onStart("auth-intent");
      reporter.printLine("▶ [hook] Executing 'lint' (task.verify): npm run lint");

      const output = stream.getOutput();
      expect(output).toContain("▶ [hook] Executing 'lint' (task.verify): npm run lint\n");
      expect(output).not.toContain("\x1b[?25l");
      expect(output).not.toMatch(new RegExp(`${String.fromCharCode(27)}\\[\\d+A`));
    });

    it("does not re-render snapshot after completion in interactive mode", () => {
      const stream = createMockStream(true);
      const reporter = new TerminalSchedulerReporter({
        getStatus: () => ({ ...mockStatusSnapshot, intentStatus: "completed" }),
        stream: stream as any,
        color: false,
        interactive: true,
      });

      reporter.onStart("auth-intent");
      reporter.onComplete("auth-intent");

      expect(reporter.isFinished()).toBe(true);

      const writeCallCount = stream.write.mock.calls.length;
      reporter.printLine("✔ [hook] Hook 'run.completed' completed successfully (10ms)");

      // Should have written the hook line directly without extra clearing or snapshot re-rendering
      expect(stream.getOutput()).toContain("✔ [hook] Hook 'run.completed' completed successfully (10ms)\n");
      // Exactly 1 additional call to stream.write for the hook line
      expect(stream.write.mock.calls.length).toBe(writeCallCount + 1);
    });
  });
});
