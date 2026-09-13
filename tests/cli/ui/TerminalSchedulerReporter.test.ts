import { describe, expect, it, vi } from "vitest";
import { TerminalSchedulerReporter } from "../../../src/cli/ui/TerminalSchedulerReporter.js";
import { StatusResult } from "../../../src/application/use-cases/GetSpecStatusUseCase.js";

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

const mockStatusSnapshot: StatusResult = {
  kind: "status",
  specName: "auth-spec",
  specStatus: "running",
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

    reporter.onStart("auth-spec");

    currentTime = 6000; // 5 seconds elapsed
    reporter.onUpdate("auth-spec");

    const output = stream.getOutput();

    // Elapsed header
    expect(output).toContain("Spec: auth-spec | Elapsed: 5s");
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

  it("supports GetSpecStatusUseCase object with execute method as getStatus", () => {
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

    reporter.onStart("auth-spec");

    expect(mockUseCase.execute).toHaveBeenCalledWith("auth-spec");
    expect(stream.getOutput()).toContain("Spec: auth-spec | Elapsed: 0ms");
  });

  it("renders onComplete with final snapshot and localized success message", () => {
    const stream = createMockStream(false);
    let currentTime = 1000;
    const completedSnapshot: StatusResult = {
      ...mockStatusSnapshot,
      specStatus: "completed",
    };

    const reporter = new TerminalSchedulerReporter({
      getStatus: () => completedSnapshot,
      stream: stream as any,
      clock: () => currentTime,
      color: false,
      interactive: false,
    });

    reporter.onStart("auth-spec");
    currentTime = 16000; // 15s elapsed
    reporter.onComplete("auth-spec");

    const output = stream.getOutput();
    expect(output).toContain("Execution of specification 'auth-spec' completed in 15s.");
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

    reporter.onStart("auth-spec");
    currentTime = 12000; // 10s elapsed
    reporter.onFail("auth-spec");

    const output = stream.getOutput();
    expect(output).toContain("Execution of specification 'auth-spec' failed after 10s.");
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

    reporter.onStart("auth-spec");
    reporter.onDeadlock("auth-spec");

    const output = stream.getOutput();
    expect(output).toContain(
      "Execution stopped because specification 'auth-spec' has a dependency deadlock.",
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

    reporter.onError(new Error("No tasks found for spec: empty-spec"));
    expect(stream.getOutput()).toContain("No tasks found for specification 'empty-spec'.");

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

    reporter.onStart("auth-spec");
    // Cursor hidden
    expect(stream.write).toHaveBeenCalledWith("\x1b[?25l");
    expect(reporter.isCursorHidden()).toBe(true);

    // On update, cursor moves up and clears
    reporter.onUpdate("auth-spec");
    expect(stream.write).toHaveBeenCalledWith(expect.stringMatching(/\x1b\[\d+A\x1b\[0J/));

    // On complete, terminal is cleaned up and cursor restored
    reporter.onComplete("auth-spec");
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

    reporter.onStart("auth-spec");
    reporter.onUpdate("auth-spec");
    reporter.onComplete("auth-spec");

    const output = stream.getOutput();
    expect(output).not.toContain("\x1b[?25l");
    expect(output).not.toContain("\x1b[?25h");
    expect(output).not.toMatch(/\x1b\[\d+A/);
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

    reporterPt.onStart("auth-spec");
    reporterPt.onComplete("auth-spec");
    const outputPt = streamPt.getOutput();

    expect(outputPt).toContain("Spec: auth-spec | Tempo decorrido: 0ms");
    expect(outputPt).toContain("Progresso: 1/4 tarefas concluídas (25%)");
    expect(outputPt).toContain("Resumo: 1 concluídas, 1 em execução, 1 com falha, 1 pendentes");
    expect(outputPt).toContain("Execução da especificação 'auth-spec' concluída em 0ms.");

    const streamEs = createMockStream(false);
    const reporterEs = new TerminalSchedulerReporter({
      getStatus: () => mockStatusSnapshot,
      stream: streamEs as any,
      clock: () => 1000,
      color: false,
      interactive: false,
      language: "es",
    });

    reporterEs.onStart("auth-spec");
    reporterEs.onFail("auth-spec");
    const outputEs = streamEs.getOutput();

    expect(outputEs).toContain("Spec: auth-spec | Tiempo transcurrido: 0ms");
    expect(outputEs).toContain("Progreso: 1/4 tareas completadas (25%)");
    expect(outputEs).toContain("La ejecución de la especificación 'auth-spec' falló después de 0ms.");
  });
});
