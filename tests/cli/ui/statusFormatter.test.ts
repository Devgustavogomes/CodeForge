/* eslint-disable no-control-regex */
import { describe, expect, it } from "vitest";
import {
  formatPlainTextStatus,
  formatStatusOutput,
} from "../../../src/cli/ui/statusFormatter.js";

const snapshot = {
  kind: "status" as const,
  specName: "feature-x",
  specStatus: "failed",
  tasks: [
    {
      id: "TASK-001",
      title: "Initialize",
      status: "completed" as const,
      dependencies: [],
      startedAt: "2026-01-01T10:00:00.000Z",
      completedAt: "2026-01-01T10:01:30.000Z",
    },
    {
      id: "TASK-002",
      title: "Serve requests",
      status: "running" as const,
      dependencies: ["TASK-001"],
      startedAt: "2026-01-01T10:01:30.000Z",
    },
    {
      id: "TASK-003",
      title: "Validate",
      status: "failed" as const,
      dependencies: ["TASK-001", "TASK-002"],
      startedAt: "2026-01-01T10:00:10.000Z",
      completedAt: "2026-01-01T10:00:10.450Z",
      errors: ["Assertion failed", "Hook rejected the task"],
    },
    {
      id: "TASK-004",
      title: "Deploy",
      status: "pending" as const,
      dependencies: ["TASK-003"],
    },
  ],
  updatedAt: "2026-01-01T10:02:00.000Z",
};

describe("statusFormatter", () => {
  it("formats aggregate progress and all four status counts", () => {
    const output = formatPlainTextStatus(snapshot);

    expect(output).toContain("Spec: feature-x (failed)");
    expect(output).toContain("Progress: 1/4 tasks completed (25%)");
    expect(output).toContain(
      "Summary: 1 completed, 1 running, 1 failed, 1 pending",
    );
  });

  it("formats every task status, dependencies, snapshot durations, and failure errors", () => {
    const output = formatPlainTextStatus(snapshot);

    expect(output).toContain(
      "[✓] TASK-001: Initialize (completed) [duration: 1m 30s]",
    );
    expect(output).toContain(
      "[▶] TASK-002: Serve requests (running) [depends on: TASK-001] [duration: 30s]",
    );
    expect(output).toContain(
      "[✗] TASK-003: Validate (failed) [depends on: TASK-001, TASK-002] [duration: 450ms]",
    );
    expect(output).toContain(
      "[○] TASK-004: Deploy (pending) [depends on: TASK-003] [duration: -]",
    );
    expect(output).toContain("Error: Assertion failed");
    expect(output).toContain("Error: Hook rejected the task");
  });

  it("keeps plain output deterministic and free of ANSI sequences", () => {
    const first = formatPlainTextStatus(snapshot);
    const second = formatPlainTextStatus(snapshot);

    expect(second).toBe(first);
    expect(first).not.toMatch(/\x1b\[/);
    expect(formatStatusOutput(snapshot, { color: false })).toBe(first);
  });

  it("adds ANSI styling only when color is requested", () => {
    const plain = formatPlainTextStatus(snapshot);
    const colored = formatStatusOutput(snapshot, { color: true });

    expect(colored).toMatch(/\x1b\[/);
    expect(colored.replace(/\x1b\[[0-9;]*m/g, "")).toBe(plain);
  });

  it("formats an empty execution without dividing by zero", () => {
    const output = formatPlainTextStatus({
      kind: "status",
      specName: "empty",
      specStatus: "pending",
      tasks: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(output).toContain("Progress: 0/0 tasks completed (0%)");
    expect(output).toContain(
      "Summary: 0 completed, 0 running, 0 failed, 0 pending",
    );
  });

  it("uses localized labels without changing task data", () => {
    const output = formatStatusOutput(snapshot, {
      color: false,
      language: "pt",
    });

    expect(output).toContain("Progresso: 1/4 tarefas concluídas (25%)");
    expect(output).toContain("TASK-002: Serve requests (em execução)");
    expect(output).toContain("depende de: TASK-001");
  });
});
