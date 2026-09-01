import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { markTaskCompleted, retryTask } from "../../src/application/task-operations.js";
import { initExecutionState, saveExecutionState } from "../../src/application/execution-state.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/specs");
  gateway.mkdir(".codeforge/executions");
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

function setupExecutionState(gateway: InMemoryWorkspaceGateway, specName: string, tasks: any[]) {
  const state = initExecutionState(specName, tasks);
  saveExecutionState(gateway, state);
  return state;
}

describe("retryTask", () => {
  let gateway: InMemoryWorkspaceGateway;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
  });

  it("resets a running task back to pending", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);
    
    // Simulate TaskScheduler initialization
    const state = setupExecutionState(gateway, "test-spec", [{ id: "TASK-001", dependencies: [] }]);
    state.tasks["TASK-001"].status = "running";
    saveExecutionState(gateway, state);

    const result = retryTask(gateway, "test-spec", "TASK-001");
    expect(result.kind).toBe("retried");

    const statePath = ".codeforge/executions/test-spec.json";
    const newState = JSON.parse(gateway.readFile(statePath));
    expect(newState.tasks["TASK-001"].status).toBe("pending");
  });

  it("fails when task is already pending", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);
    writeTask(gateway, "TASK-002", ["TASK-001"]);

    setupExecutionState(gateway, "test-spec", [{ id: "TASK-002", dependencies: ["TASK-001"] }]);

    const result = retryTask(gateway, "test-spec", "TASK-002");
    expect(result.kind).toBe("already-pending");
  });

  it("fails when task is already completed", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);

    setupExecutionState(gateway, "test-spec", [{ id: "TASK-001", dependencies: [] }]);
    markTaskCompleted(gateway, "test-spec", "TASK-001");

    const result = retryTask(gateway, "test-spec", "TASK-001");
    expect(result.kind).toBe("already-completed");
  });

  it("fails when task does not exist", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);
    setupExecutionState(gateway, "test-spec", [{ id: "TASK-001", dependencies: [] }]);

    const result = retryTask(gateway, "test-spec", "TASK-999");
    expect(result.kind).toBe("not-found");
  });
});

describe("markTaskCompleted", () => {
  let gateway: InMemoryWorkspaceGateway;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
  });

  it("marks task as completed", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", []);
    setupExecutionState(gateway, "test-spec", [{ id: "TASK-001", dependencies: [] }]);

    const result = markTaskCompleted(gateway, "test-spec", "TASK-001");
    expect(result.kind).toBe("completed");
    if (result.kind === "completed") {
      expect(result.allCompleted).toBe(true);
    }
  });
});
