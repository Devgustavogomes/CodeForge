import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { runExecution, markTaskCompleted, retryTask } from "../../src/application/run-execution.js";
import { SpecExecutionState } from "../../src/domain/execution.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/specs");
  gateway.mkdir(".codeforge/tasks/test-spec");
  gateway.writeFile(".codeforge/metadata.json", JSON.stringify({ initialized: true }));
  gateway.writeFile(".codeforge/config.yaml", 'version: "1.0"\n');
}

function writeTask(gateway: InMemoryWorkspaceGateway, id: string, deps: string[] = []) {
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
  gateway.writeFile(`.codeforge/tasks/test-spec/${id}.json`, JSON.stringify(task));
}

describe("runExecution", () => {
  let gateway: InMemoryWorkspaceGateway;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
  });

  it("returns notInitialized if metadata missing", () => {
    const result = runExecution(gateway, "test-spec");
    expect(result.kind).toBe("not-initialized");
  });

  it("initializes execution state on first run and requests manual execution", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);
    
    const result = runExecution(gateway, "test-spec");
    
    expect(result.kind).toBe("task-ready");
    if (result.kind === "task-ready") {
      expect(result.taskId).toBe("TASK-001");

      // Verify state was created
      const statePath = ".codeforge/executions/test-spec.json";
      expect(gateway.exists(statePath)).toBe(true);
      const state = JSON.parse(gateway.readFile(statePath)) as SpecExecutionState;
      expect(state.tasks["TASK-001"].status).toBe("running");

      // Verify prompt was created
      expect(gateway.exists(result.promptPath!)).toBe(true);
    }
  });

  it("finds next task automatically when previous is completed", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);
    writeTask(gateway, "TASK-002", ["TASK-001"]);

    // First run should pick TASK-001
    const res1 = runExecution(gateway, "test-spec");
    expect(res1.kind).toBe("task-ready");
    if (res1.kind === "task-ready") {
      expect(res1.taskId).toBe("TASK-001");
    }

    // Mark TASK-001 as completed
    const success = markTaskCompleted(gateway, "test-spec", "TASK-001");
    expect(success.kind).toBe("completed");

    // Second run should pick TASK-002
    const res2 = runExecution(gateway, "test-spec");
    expect(res2.kind).toBe("task-ready");
    if (res2.kind === "task-ready") {
      expect(res2.taskId).toBe("TASK-002");
    }
  });

  it("detects when all tasks are finished", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);

    runExecution(gateway, "test-spec");
    markTaskCompleted(gateway, "test-spec", "TASK-001");

    const res = runExecution(gateway, "test-spec");
    expect(res.kind).toBe("finished");

    const state = JSON.parse(gateway.readFile(".codeforge/executions/test-spec.json"));
    expect(state.status).toBe("completed");
  });
});

describe("retryTask", () => {
  let gateway: InMemoryWorkspaceGateway;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
  });

  it("resets a running task back to pending", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);

    runExecution(gateway, "test-spec");

    const result = retryTask(gateway, "test-spec", "TASK-001");
    expect(result.kind).toBe("retried");

    const state = JSON.parse(gateway.readFile(".codeforge/executions/test-spec.json"));
    expect(state.tasks["TASK-001"].status).toBe("pending");
  });

  it("fails when task is already pending", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);
    writeTask(gateway, "TASK-002", ["TASK-001"]);

    runExecution(gateway, "test-spec");

    const result = retryTask(gateway, "test-spec", "TASK-002");
    expect(result.kind).toBe("already-pending");
  });

  it("fails when task is already completed", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);

    runExecution(gateway, "test-spec");
    markTaskCompleted(gateway, "test-spec", "TASK-001");

    const result = retryTask(gateway, "test-spec", "TASK-001");
    expect(result.kind).toBe("already-completed");
  });

  it("fails when task does not exist", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);
    runExecution(gateway, "test-spec");

    const result = retryTask(gateway, "test-spec", "TASK-999");
    expect(result.kind).toBe("not-found");
  });

  it("allows re-execution after retry", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);

    const res1 = runExecution(gateway, "test-spec");
    expect(res1.kind).toBe("task-ready");

    retryTask(gateway, "test-spec", "TASK-001");

    const res2 = runExecution(gateway, "test-spec");
    expect(res2.kind).toBe("task-ready");
    if (res2.kind === "task-ready") {
      expect(res2.taskId).toBe("TASK-001");
    }
  });
});
