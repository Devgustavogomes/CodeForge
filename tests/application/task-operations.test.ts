import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { TaskOperationsUseCase } from "../../src/application/use-cases/TaskOperationsUseCase.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { Task } from "../../src/domain/task.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/specs");
  gateway.mkdir(".codeforge/executions");
  gateway.mkdir(".codeforge/tasks/test-spec");
  gateway.writeFile(".codeforge/metadata.json", JSON.stringify({ initialized: true }));
  gateway.writeFile(".codeforge/config.yaml", 'version: "1.0"\n');
}

function writeTask(gateway: InMemoryWorkspaceGateway, id: string, deps: string[] = []) {
  const task: Task = {
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

function setupExecutionState(gateway: InMemoryWorkspaceGateway, specName: string, tasks: Partial<Task>[]) {
  const repo = new ExecutionStateRepository(gateway);
  const state = repo.init(specName, tasks as Task[]);
  repo.save(state);
  return state;
}

describe("TaskOperationsUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let useCase: TaskOperationsUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    useCase = new TaskOperationsUseCase(gateway);
  });

  describe("retryTask", () => {
    it("resets a running task back to pending", () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);
      
      // Simulate TaskScheduler initialization
      const state = setupExecutionState(gateway, "test-spec", [{ id: "TASK-001", title: "T", dependencies: [] }]);
      state.tasks["TASK-001"].status = "running";
      new ExecutionStateRepository(gateway).save(state);

      const result = useCase.retryTask("test-spec", "TASK-001");
      expect(result.kind).toBe("retried");

      const statePath = ".codeforge/executions/test-spec.json";
      const newState = JSON.parse(gateway.readFile(statePath));
      expect(newState.tasks["TASK-001"].status).toBe("pending");
    });

    it("resets a failed task and changes state.status to pending", () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);

      const state = setupExecutionState(gateway, "test-spec", [{ id: "TASK-001", title: "T", dependencies: [] }]);
      state.status = "failed";
      state.completedAt = new Date().toISOString();
      state.tasks["TASK-001"].status = "failed";
      new ExecutionStateRepository(gateway).save(state);

      const result = useCase.retryTask("test-spec", "TASK-001");
      expect(result.kind).toBe("retried");

      const statePath = ".codeforge/executions/test-spec.json";
      const newState = JSON.parse(gateway.readFile(statePath));
      expect(newState.tasks["TASK-001"].status).toBe("pending");
      expect(newState.status).toBe("pending");
      expect(newState.completedAt).toBeUndefined();
    });

    it("fails when task is already pending", () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);
      writeTask(gateway, "TASK-002", ["TASK-001"]);

      setupExecutionState(gateway, "test-spec", [{ id: "TASK-002", title: "T", dependencies: ["TASK-001"] }]);

      const result = useCase.retryTask("test-spec", "TASK-002");
      expect(result.kind).toBe("already-pending");
    });

    it("fails when task is already completed", () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);

      setupExecutionState(gateway, "test-spec", [{ id: "TASK-001", title: "T", dependencies: [] }]);
      useCase.markTaskCompleted("test-spec", "TASK-001");

      const result = useCase.retryTask("test-spec", "TASK-001");
      expect(result.kind).toBe("already-completed");
    });

    it("fails when task does not exist", () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);
      setupExecutionState(gateway, "test-spec", [{ id: "TASK-001", title: "T", dependencies: [] }]);

      const result = useCase.retryTask("test-spec", "TASK-999");
      expect(result.kind).toBe("not-found");
    });
  });

  describe("markTaskCompleted", () => {
    it("marks task as completed", () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);
      setupExecutionState(gateway, "test-spec", [{ id: "TASK-001", title: "T", dependencies: [] }]);

      const result = useCase.markTaskCompleted("test-spec", "TASK-001");
      expect(result.kind).toBe("completed");
      if (result.kind === "completed") {
        expect(result.allCompleted).toBe(true);
      }
    });
  });
});
