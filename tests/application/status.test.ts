import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getSpecStatus, formatStatusOutput } from "../../src/application/status.js";
import { SpecExecutionState } from "../../src/domain/execution.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-test-status-"));
}

function makeWorkspace(tempDir: string): void {
  const root = path.join(tempDir, ".codeforge");
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, "specs"));
  fs.mkdirSync(path.join(root, "tasks", "test-spec"), { recursive: true });
  fs.mkdirSync(path.join(root, "executions"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "metadata.json"),
    JSON.stringify({ initialized: true }),
    "utf-8"
  );
}

function writeTask(tempDir: string, id: string, title: string, deps: string[] = []) {
  const task = {
    id,
    title,
    objective: "O",
    context: "C",
    implementation: "I",
    files: [],
    dependencies: deps,
    constraints: [],
    acceptanceCriteria: [],
  };
  const p = path.join(tempDir, ".codeforge", "tasks", "test-spec", `${id}.json`);
  fs.writeFileSync(p, JSON.stringify(task), "utf-8");
}

function writeState(tempDir: string, state: SpecExecutionState) {
  const p = path.join(tempDir, ".codeforge", "executions", `${state.specId}.json`);
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf-8");
}

describe("getSpecStatus", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns notInitialized when metadata is missing", () => {
    const result = getSpecStatus(tempDir, "test-spec");
    expect(result.notInitialized).toBe(true);
  });

  it("returns specNotFound when tasks directory is missing", () => {
    makeWorkspace(tempDir);
    const result = getSpecStatus(tempDir, "nonexistent");
    expect(result.specNotFound).toBe(true);
  });

  it("returns noExecution when no execution state exists", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", "Setup", []);
    const result = getSpecStatus(tempDir, "test-spec");
    expect(result.noExecution).toBe(true);
  });

  it("returns task statuses from execution state", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", "Setup project", []);
    writeTask(tempDir, "TASK-002", "Add routes", ["TASK-001"]);
    writeTask(tempDir, "TASK-003", "Add tests", ["TASK-002"]);

    writeState(tempDir, {
      specId: "test-spec",
      status: "running",
      tasks: {
        "TASK-001": { status: "completed" },
        "TASK-002": { status: "running" },
        "TASK-003": { status: "pending" },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = getSpecStatus(tempDir, "test-spec");

    expect(result.specStatus).toBe("running");
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks[0]).toMatchObject({ id: "TASK-001", status: "completed", title: "Setup project" });
    expect(result.tasks[1]).toMatchObject({ id: "TASK-002", status: "running", title: "Add routes" });
    expect(result.tasks[2]).toMatchObject({ id: "TASK-003", status: "pending", title: "Add tests" });
  });

  it("includes dependencies in task info", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", "First", []);
    writeTask(tempDir, "TASK-002", "Second", ["TASK-001"]);

    writeState(tempDir, {
      specId: "test-spec",
      status: "running",
      tasks: {
        "TASK-001": { status: "completed" },
        "TASK-002": { status: "pending" },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = getSpecStatus(tempDir, "test-spec");

    expect(result.tasks[0].dependencies).toEqual([]);
    expect(result.tasks[1].dependencies).toEqual(["TASK-001"]);
  });

  it("returns tasks sorted by ID", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-003", "Third", []);
    writeTask(tempDir, "TASK-001", "First", []);
    writeTask(tempDir, "TASK-002", "Second", []);

    writeState(tempDir, {
      specId: "test-spec",
      status: "running",
      tasks: {
        "TASK-001": { status: "pending" },
        "TASK-002": { status: "pending" },
        "TASK-003": { status: "pending" },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = getSpecStatus(tempDir, "test-spec");
    expect(result.tasks.map((t) => t.id)).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
  });
});

describe("formatStatusOutput", () => {
  it("shows progress bar and task list", () => {
    const output = formatStatusOutput({
      notInitialized: false,
      specNotFound: false,
      noExecution: false,
      specName: "todo-api",
      specStatus: "running",
      tasks: [
        { id: "TASK-001", title: "Setup", status: "completed", dependencies: [] },
        { id: "TASK-002", title: "Routes", status: "running", dependencies: ["TASK-001"] },
        { id: "TASK-003", title: "Tests", status: "pending", dependencies: ["TASK-002"] },
      ],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(output).toContain("todo-api");
    expect(output).toContain("TASK-001");
    expect(output).toContain("TASK-002");
    expect(output).toContain("TASK-003");
    expect(output).toContain("33%");
    expect(output).toContain("1/3");
  });

  it("shows 100% when all tasks completed", () => {
    const output = formatStatusOutput({
      notInitialized: false,
      specNotFound: false,
      noExecution: false,
      specName: "test",
      specStatus: "completed",
      tasks: [
        { id: "TASK-001", title: "Done", status: "completed", dependencies: [] },
      ],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(output).toContain("100%");
    expect(output).toContain("1/1");
  });
});
