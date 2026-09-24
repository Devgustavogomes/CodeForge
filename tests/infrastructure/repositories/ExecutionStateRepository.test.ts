import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionStateRepository } from "../../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { InMemoryWorkspaceGateway } from "../../helpers/in-memory-workspace.js";
import { Task } from "../../../src/domain/task.js";
import { PATHS } from "../../../src/infrastructure/paths.js";

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

    const state = repo.init("intent1", tasks);
    expect(state.intentId).toBe("intent1");
    expect(state.status).toBe("running");
    expect(state.tasks["T1"].status).toBe("pending");
    expect(state.tasks["T2"].dependencies).toEqual(["T1"]);
  });

  it("should save and load state", () => {
    const tasks: Task[] = [
      mockTask("T1", "Task 1", [])
    ];
    
    const state = repo.init("intent1", tasks);
    repo.save(state);

    const loadedState = repo.load("intent1");
    expect(loadedState).toMatchObject({
      intentId: "intent1",
      status: "running",
      tasks: {
        T1: {
          status: "pending",
          dependencies: [],
        },
      },
    });
  });

  it("should return null if loading non-existent state", () => {
    const loadedState = repo.load("non-existent-intent");
    expect(loadedState).toBeNull();
  });

  it("persists review lifecycle metadata", () => {
    const state = repo.init("intent1", [mockTask("T1", "Task 1")]);
    state.status = "reviewing";
    repo.save(state);
    expect(repo.load("intent1")?.status).toBe("reviewing");

    state.status = "paused";
    state.reviewRounds = 2;
    state.reviewError = "Reviewer timed out";
    repo.save(state);

    expect(repo.load("intent1")).toMatchObject({
      status: "paused",
      reviewRounds: 2,
      reviewError: "Reviewer timed out",
    });
  });

  it("loads execution states written before review metadata existed", () => {
    gw.writeFile(PATHS.executionState("legacy"), JSON.stringify({
      intentId: "legacy",
      status: "completed",
      tasks: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));

    expect(repo.load("legacy")).toEqual({
      intentId: "legacy",
      status: "completed",
      tasks: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
