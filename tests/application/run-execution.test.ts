import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runExecution, markTaskCompleted, retryTask } from "../../src/application/run-execution.js";
import { SpecExecutionState } from "../../src/domain/execution.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-test-run-"));
}

function makeWorkspace(tempDir: string): void {
  const root = path.join(tempDir, ".codeforge");
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, "specs"));
  fs.mkdirSync(path.join(root, "tasks", "test-spec"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "metadata.json"),
    JSON.stringify({ initialized: true }),
    "utf-8"
  );
  fs.writeFileSync(path.join(root, "config.yaml"), 'version: "1.0"\n');
}

function writeTask(tempDir: string, id: string, deps: string[] = []) {
  const task = {
    id,
    title: "T",
    objective: "O",
    context: "C",
    implementation: "I",
    files: [],
    dependencies: deps,
    constraints: [],
    acceptanceCriteria: []
  };
  const p = path.join(tempDir, ".codeforge", "tasks", "test-spec", `${id}.json`);
  fs.writeFileSync(p, JSON.stringify(task), "utf-8");
}

describe("runExecution", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns notInitialized if metadata missing", () => {
    const result = runExecution(tempDir, "test-spec");
    expect(result.notInitialized).toBe(true);
  });

  it("initializes execution state on first run and requests manual execution", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);
    
    const result = runExecution(tempDir, "test-spec");
    
    expect(result.manualTaskRequired).toBe("TASK-001");
    expect(result.finished).toBe(false);

    // Verify state was created
    const statePath = path.join(tempDir, ".codeforge", "executions", "test-spec.json");
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as SpecExecutionState;
    expect(state.tasks["TASK-001"].status).toBe("running");

    // Verify prompt was created
    expect(fs.existsSync(result.manualPromptPath!)).toBe(true);
  });

  it("finds next task automatically when previous is completed", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);
    writeTask(tempDir, "TASK-002", ["TASK-001"]); // depends on 1

    // First run should pick TASK-001
    const res1 = runExecution(tempDir, "test-spec");
    expect(res1.manualTaskRequired).toBe("TASK-001");

    // Mark TASK-001 as completed
    const success = markTaskCompleted(tempDir, "test-spec", "TASK-001");
    expect(success).toBe(true);

    // Second run should pick TASK-002
    const res2 = runExecution(tempDir, "test-spec");
    expect(res2.manualTaskRequired).toBe("TASK-002");
  });

  it("detects when all tasks are finished", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);

    runExecution(tempDir, "test-spec");
    markTaskCompleted(tempDir, "test-spec", "TASK-001");

    const res = runExecution(tempDir, "test-spec");
    expect(res.finished).toBe(true);
    expect(res.tasksCompleted).toBe(0); // in this run

    const state = JSON.parse(fs.readFileSync(path.join(tempDir, ".codeforge", "executions", "test-spec.json"), "utf-8"));
    expect(state.status).toBe("completed");
  });
});

describe("retryTask", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("resets a running task back to pending", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);

    // run puts it in "running" status
    runExecution(tempDir, "test-spec");

    const result = retryTask(tempDir, "test-spec", "TASK-001");
    expect(result.success).toBe(true);

    const state = JSON.parse(fs.readFileSync(path.join(tempDir, ".codeforge", "executions", "test-spec.json"), "utf-8"));
    expect(state.tasks["TASK-001"].status).toBe("pending");
  });

  it("fails when task is already pending", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);
    writeTask(tempDir, "TASK-002", ["TASK-001"]);

    // run initializes state — TASK-002 stays pending
    runExecution(tempDir, "test-spec");

    const result = retryTask(tempDir, "test-spec", "TASK-002");
    expect(result.success).toBe(false);
    expect(result.reason).toContain("already pending");
  });

  it("fails when task is already completed", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);

    runExecution(tempDir, "test-spec");
    markTaskCompleted(tempDir, "test-spec", "TASK-001");

    const result = retryTask(tempDir, "test-spec", "TASK-001");
    expect(result.success).toBe(false);
    expect(result.reason).toContain("already completed");
  });

  it("fails when task does not exist", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);
    runExecution(tempDir, "test-spec");

    const result = retryTask(tempDir, "test-spec", "TASK-999");
    expect(result.success).toBe(false);
  });

  it("allows re-execution after retry", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);

    // First run — task goes to running
    const res1 = runExecution(tempDir, "test-spec");
    expect(res1.manualTaskRequired).toBe("TASK-001");

    // Retry — task goes back to pending
    retryTask(tempDir, "test-spec", "TASK-001");

    // Run again — should pick TASK-001 again
    const res2 = runExecution(tempDir, "test-spec");
    expect(res2.manualTaskRequired).toBe("TASK-001");
  });
});
