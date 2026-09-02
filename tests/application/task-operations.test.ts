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

  describe("retrySpec", () => {
    it("returns spec-not-found when spec does not exist", () => {
      makeWorkspace(gateway);
      const result = useCase.retrySpec("nonexistent");
      expect(result).toEqual({ kind: "spec-not-found" });
    });

    it("returns no-execution when execution state does not exist", () => {
      makeWorkspace(gateway);
      const result = useCase.retrySpec("test-spec");
      expect(result).toEqual({ kind: "no-execution", specName: "test-spec" });
    });

    it("returns all-completed when all tasks are completed", () => {
      makeWorkspace(gateway);
      const state = setupExecutionState(gateway, "test-spec", [
        { id: "TASK-001", title: "T1", dependencies: [] },
        { id: "TASK-002", title: "T2", dependencies: [] },
      ]);
      state.status = "completed";
      state.tasks["TASK-001"].status = "completed";
      state.tasks["TASK-002"].status = "completed";
      new ExecutionStateRepository(gateway).save(state);

      const result = useCase.retrySpec("test-spec");
      expect(result).toEqual({ kind: "all-completed", specName: "test-spec" });
    });

    it("returns no-failed-tasks with pendingCount when no tasks failed", () => {
      makeWorkspace(gateway);
      const state = setupExecutionState(gateway, "test-spec", [
        { id: "TASK-001", title: "T1", dependencies: [] },
        { id: "TASK-002", title: "T2", dependencies: [] },
      ]);
      state.tasks["TASK-001"].status = "completed";
      state.tasks["TASK-002"].status = "pending";
      new ExecutionStateRepository(gateway).save(state);

      const result = useCase.retrySpec("test-spec");
      expect(result).toEqual({
        kind: "no-failed-tasks",
        specName: "test-spec",
        pendingCount: 1,
      });
    });

    it("resets failed tasks to pending, clears startedAt/completedAt, preserves errors, and updates spec status", () => {
      makeWorkspace(gateway);
      const state = setupExecutionState(gateway, "test-spec", [
        { id: "TASK-001", title: "T1", dependencies: [] },
        { id: "TASK-002", title: "T2", dependencies: [] },
        { id: "TASK-003", title: "T3", dependencies: [] },
      ]);
      state.status = "failed";
      state.startedAt = "2026-09-01T09:00:00.000Z";
      state.completedAt = "2026-09-01T10:05:00.000Z";

      state.tasks["TASK-001"].status = "failed";
      state.tasks["TASK-001"].startedAt = "2026-09-01T10:00:00.000Z";
      state.tasks["TASK-001"].completedAt = "2026-09-01T10:05:00.000Z";
      state.tasks["TASK-001"].errors = ["SyntaxError: unexpected token", "Test failed"];

      state.tasks["TASK-002"].status = "completed";
      state.tasks["TASK-002"].startedAt = "2026-09-01T10:00:00.000Z";
      state.tasks["TASK-002"].completedAt = "2026-09-01T10:02:00.000Z";

      state.tasks["TASK-003"].status = "pending";

      new ExecutionStateRepository(gateway).save(state);

      const result = useCase.retrySpec("test-spec");
      expect(result).toEqual({
        kind: "retried",
        specName: "test-spec",
        retriedTasks: ["TASK-001"],
      });

      const repo = new ExecutionStateRepository(gateway);
      const updatedState = repo.load("test-spec")!;
      expect(updatedState.status).toBe("pending");
      expect(updatedState.completedAt).toBeUndefined();
      expect(updatedState.startedAt).toBe("2026-09-01T09:00:00.000Z");

      expect(updatedState.tasks["TASK-001"].status).toBe("pending");
      expect(updatedState.tasks["TASK-001"].startedAt).toBeUndefined();
      expect(updatedState.tasks["TASK-001"].completedAt).toBeUndefined();
      expect(updatedState.tasks["TASK-001"].errors).toEqual([
        "SyntaxError: unexpected token",
        "Test failed",
      ]);

      expect(updatedState.tasks["TASK-002"].status).toBe("completed");
      expect(updatedState.tasks["TASK-002"].completedAt).toBe("2026-09-01T10:02:00.000Z");

      expect(updatedState.tasks["TASK-003"].status).toBe("pending");
    });
  });

  describe("resetTasks", () => {
    it("returns spec-not-found when spec does not exist", () => {
      makeWorkspace(gateway);
      const result = useCase.resetTasks("nonexistent");
      expect(result).toEqual({ kind: "spec-not-found" });

      const resultSingle = useCase.resetTasks("nonexistent", "TASK-001");
      expect(resultSingle).toEqual({ kind: "spec-not-found" });
    });

    it("returns no-execution when execution state does not exist", () => {
      makeWorkspace(gateway);
      const result = useCase.resetTasks("test-spec");
      expect(result).toEqual({ kind: "no-execution", specName: "test-spec" });

      const resultSingle = useCase.resetTasks("test-spec", "TASK-001");
      expect(resultSingle).toEqual({ kind: "no-execution", specName: "test-spec" });
    });

    it("returns task-not-found when specified taskId does not exist", () => {
      makeWorkspace(gateway);
      setupExecutionState(gateway, "test-spec", [{ id: "TASK-001", title: "T", dependencies: [] }]);

      const result = useCase.resetTasks("test-spec", "TASK-999");
      expect(result).toEqual({ kind: "task-not-found", taskId: "TASK-999" });
    });

    it("resets a single task, removing startedAt, completedAt, errors, and resets spec completedAt", () => {
      makeWorkspace(gateway);
      const state = setupExecutionState(gateway, "test-spec", [
        { id: "TASK-001", title: "T1", dependencies: [] },
        { id: "TASK-002", title: "T2", dependencies: [] },
      ]);
      state.status = "completed";
      state.startedAt = "2026-09-01T09:00:00.000Z";
      state.completedAt = "2026-09-01T10:05:00.000Z";

      state.tasks["TASK-001"].status = "completed";
      state.tasks["TASK-001"].startedAt = "2026-09-01T10:00:00.000Z";
      state.tasks["TASK-001"].completedAt = "2026-09-01T10:05:00.000Z";
      state.tasks["TASK-001"].errors = ["previous error"];

      state.tasks["TASK-002"].status = "completed";
      state.tasks["TASK-002"].startedAt = "2026-09-01T10:00:00.000Z";
      state.tasks["TASK-002"].completedAt = "2026-09-01T10:05:00.000Z";

      new ExecutionStateRepository(gateway).save(state);

      const result = useCase.resetTasks("test-spec", "TASK-001");
      expect(result).toEqual({
        kind: "reset-single",
        specName: "test-spec",
        taskId: "TASK-001",
      });

      const repo = new ExecutionStateRepository(gateway);
      const updatedState = repo.load("test-spec")!;
      expect(updatedState.status).toBe("pending");
      expect(updatedState.completedAt).toBeUndefined();
      expect(updatedState.startedAt).toBe("2026-09-01T09:00:00.000Z");

      expect(updatedState.tasks["TASK-001"].status).toBe("pending");
      expect(updatedState.tasks["TASK-001"].startedAt).toBeUndefined();
      expect(updatedState.tasks["TASK-001"].completedAt).toBeUndefined();
      expect(updatedState.tasks["TASK-001"].errors).toBeUndefined();

      expect(updatedState.tasks["TASK-002"].status).toBe("completed");
      expect(updatedState.tasks["TASK-002"].startedAt).toBe("2026-09-01T10:00:00.000Z");
      expect(updatedState.tasks["TASK-002"].completedAt).toBe("2026-09-01T10:05:00.000Z");
    });

    it("resets all tasks when taskId is omitted, clearing all timestamps/errors and spec startedAt/completedAt", () => {
      makeWorkspace(gateway);
      const state = setupExecutionState(gateway, "test-spec", [
        { id: "TASK-001", title: "T1", dependencies: [] },
        { id: "TASK-002", title: "T2", dependencies: [] },
      ]);
      state.status = "failed";
      state.startedAt = "2026-09-01T09:00:00.000Z";
      state.completedAt = "2026-09-01T10:05:00.000Z";

      state.tasks["TASK-001"].status = "failed";
      state.tasks["TASK-001"].startedAt = "2026-09-01T10:00:00.000Z";
      state.tasks["TASK-001"].completedAt = "2026-09-01T10:05:00.000Z";
      state.tasks["TASK-001"].errors = ["Error A"];

      state.tasks["TASK-002"].status = "completed";
      state.tasks["TASK-002"].startedAt = "2026-09-01T10:00:00.000Z";
      state.tasks["TASK-002"].completedAt = "2026-09-01T10:05:00.000Z";
      state.tasks["TASK-002"].errors = ["Error B"];

      new ExecutionStateRepository(gateway).save(state);

      const result = useCase.resetTasks("test-spec");
      expect(result).toEqual({
        kind: "reset-all",
        specName: "test-spec",
        count: 2,
      });

      const repo = new ExecutionStateRepository(gateway);
      const updatedState = repo.load("test-spec")!;
      expect(updatedState.status).toBe("pending");
      expect(updatedState.startedAt).toBeUndefined();
      expect(updatedState.completedAt).toBeUndefined();

      expect(updatedState.tasks["TASK-001"].status).toBe("pending");
      expect(updatedState.tasks["TASK-001"].startedAt).toBeUndefined();
      expect(updatedState.tasks["TASK-001"].completedAt).toBeUndefined();
      expect(updatedState.tasks["TASK-001"].errors).toBeUndefined();

      expect(updatedState.tasks["TASK-002"].status).toBe("pending");
      expect(updatedState.tasks["TASK-002"].startedAt).toBeUndefined();
      expect(updatedState.tasks["TASK-002"].completedAt).toBeUndefined();
      expect(updatedState.tasks["TASK-002"].errors).toBeUndefined();
    });
  });
});
