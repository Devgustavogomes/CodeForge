import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionStateRepository } from "../../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { InMemoryWorkspaceGateway } from "../../helpers/in-memory-workspace.js";
import { Task } from "../../../src/domain/task.js";

function mockTask(id: string, title: string, deps: string[] = []): Task {
  return {
    id,
    title,
    objective: "O",
    context: "C",
    implementation: "I",
    files: [],
    dependencies: deps,
    constraints: [],
    acceptanceCriteria: []
  };
}

describe("ExecutionStateRepository", () => {
  let gw: InMemoryWorkspaceGateway;
  let repo: ExecutionStateRepository;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    repo = new ExecutionStateRepository(gw);
  });

  it("should init state correctly", () => {
    const tasks: Task[] = [
      mockTask("T1", "Task 1", []),
      mockTask("T2", "Task 2", ["T1"])
    ];

    const state = repo.init("spec1", tasks);
    expect(state.specId).toBe("spec1");
    expect(state.status).toBe("running");
    expect(state.tasks["T1"].status).toBe("pending");
    expect(state.tasks["T2"].dependencies).toEqual(["T1"]);
  });

  it("should save and load state", () => {
    const tasks: Task[] = [
      mockTask("T1", "Task 1", [])
    ];
    
    const state = repo.init("spec1", tasks);
    repo.save(state);

    const loadedState = repo.load("spec1");
    expect(loadedState).not.toBeNull();
    expect(loadedState?.specId).toBe("spec1");
    expect(loadedState?.tasks["T1"].status).toBe("pending");
  });

  it("should return null if loading non-existent state", () => {
    const loadedState = repo.load("non-existent-spec");
    expect(loadedState).toBeNull();
  });
});
