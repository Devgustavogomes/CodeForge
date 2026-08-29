import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
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
    const result = runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("not-initialized");
  });

  it("initializes execution state on first run and requests manual execution", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);
    
    const result = runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");
    
    expect(result.kind).toBe("task-ready");
    if (result.kind === "task-ready") {
      expect(result.taskId).toBe("TASK-001");

    // Verify state was created
    const statePath = path.join(tempDir, ".codeforge", "executions", "test-spec.json");
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as SpecExecutionState;
    expect(state.tasks["TASK-001"].status).toBe("running");

    // Verify prompt was created
      expect(fs.existsSync(path.join(tempDir, result.promptPath!))).toBe(true);
    }
  });

  it("finds next task automatically when previous is completed", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);
    writeTask(tempDir, "TASK-002", ["TASK-001"]); // depends on 1

    // First run should pick TASK-001
    const res1 = runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(res1.kind).toBe("task-ready");
    if (res1.kind === "task-ready") {
      expect(res1.taskId).toBe("TASK-001");
    }

    // Mark TASK-001 as completed
    const success = markTaskCompleted(new NodeWorkspaceGateway(tempDir), "test-spec", "TASK-001");
    expect(success.kind).toBe("completed");

    // Second run should pick TASK-002
    const res2 = runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(res2.kind).toBe("task-ready");
    if (res2.kind === "task-ready") {
      expect(res2.taskId).toBe("TASK-002");
    }
  });

  it("detects when all tasks are finished", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);

    runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");
    markTaskCompleted(new NodeWorkspaceGateway(tempDir), "test-spec", "TASK-001");

    const res = runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(res.kind).toBe("finished");

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
    runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");

    const result = retryTask(new NodeWorkspaceGateway(tempDir), "test-spec", "TASK-001");
    expect(result.kind).toBe("retried");

    const state = JSON.parse(fs.readFileSync(path.join(tempDir, ".codeforge", "executions", "test-spec.json"), "utf-8"));
    expect(state.tasks["TASK-001"].status).toBe("pending");
  });

  it("fails when task is already pending", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);
    writeTask(tempDir, "TASK-002", ["TASK-001"]);

    // run initializes state — TASK-002 stays pending
    runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");

    const result = retryTask(new NodeWorkspaceGateway(tempDir), "test-spec", "TASK-002");
    expect(result.kind).toBe("already-pending");
  });

  it("fails when task is already completed", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);

    runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");
    markTaskCompleted(new NodeWorkspaceGateway(tempDir), "test-spec", "TASK-001");

    const result = retryTask(new NodeWorkspaceGateway(tempDir), "test-spec", "TASK-001");
    expect(result.kind).toBe("already-completed");
  });

  it("fails when task does not exist", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);
    runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");

    const result = retryTask(new NodeWorkspaceGateway(tempDir), "test-spec", "TASK-999");
    expect(result.kind).toBe("not-found");
  });

  it("allows re-execution after retry", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "TASK-001", []);

    // First run — task goes to running
    const res1 = runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(res1.kind).toBe("task-ready");
    if (res1.kind === "task-ready") {
      expect(res1.taskId).toBe("TASK-001");
    }

    // Retry — task goes back to pending
    retryTask(new NodeWorkspaceGateway(tempDir), "test-spec", "TASK-001");

    // Run again — should pick TASK-001 again
    const res2 = runExecution(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(res2.kind).toBe("task-ready");
    if (res2.kind === "task-ready") {
      expect(res2.taskId).toBe("TASK-001");
    }
  });
});
