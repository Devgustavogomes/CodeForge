import { describe, it, expect, beforeEach } from "vitest";
import {
  loadTasksFromDisk,
  areTasksEqual,
  getSpecTaskCount,
  TaskItem,
} from "../../../../src/cli/tui/context/ExecutionContext/taskLoader.js";
import { InMemoryWorkspaceGateway } from "../../../helpers/in-memory-workspace.js";
import { ExecutionStateRepository } from "../../../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { Task } from "../../../../src/domain/task.js";

describe("taskLoader", () => {
  let gw: InMemoryWorkspaceGateway;
  let stateRepo: ExecutionStateRepository;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    stateRepo = new ExecutionStateRepository(gw);
  });

  it("loads tasks from disk and merges with execution state", () => {
    gw.mkdir(".codeforge/tasks/auth-spec");
    const task1: Task = {
      id: "TASK-001",
      title: "Login page",
      dependencies: [],
      objective: "Build login",
    };
    gw.writeFile(
      ".codeforge/tasks/auth-spec/TASK-001.json",
      JSON.stringify(task1),
    );

    const state = stateRepo.init("auth-spec", [task1]);
    state.tasks["TASK-001"].status = "completed";
    state.tasks["TASK-001"].completedAt = "2026-09-01T12:00:00Z";
    stateRepo.save(state);

    const items = loadTasksFromDisk(gw, stateRepo, "auth-spec");
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("TASK-001");
    expect(items[0].title).toBe("Login page");
    expect(items[0].status).toBe("completed");
    expect(items[0].completedAt).toBe("2026-09-01T12:00:00Z");
    expect(items[0].objective).toBe("Build login");
  });

  it("returns empty array if tasks directory does not exist", () => {
    const items = loadTasksFromDisk(gw, stateRepo, "non-existent");
    expect(items).toEqual([]);
  });

  it("includes tasks present in state repository even if missing from disk", () => {
    const state = stateRepo.init("orphaned-spec", []);
    state.tasks["TASK-GHOST"] = {
      title: "Ghost task",
      status: "failed",
      dependencies: [],
      errors: ["Missing file"],
    };
    stateRepo.save(state);

    const items = loadTasksFromDisk(gw, stateRepo, "orphaned-spec");
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("TASK-GHOST");
    expect(items[0].status).toBe("failed");
    expect(items[0].errors).toEqual(["Missing file"]);
  });

  describe("areTasksEqual", () => {
    const baseTask: TaskItem = {
      id: "TASK-001",
      title: "Test Task",
      status: "pending",
      dependencies: [],
    };

    it("returns true for identical task lists", () => {
      const listA = [{ ...baseTask }];
      const listB = [{ ...baseTask }];
      expect(areTasksEqual(listA, listB)).toBe(true);
    });

    it("returns false if task status differs", () => {
      const listA = [{ ...baseTask, status: "pending" as const }];
      const listB = [{ ...baseTask, status: "running" as const }];
      expect(areTasksEqual(listA, listB)).toBe(false);
    });

    it("returns false if timestamps differ", () => {
      const listA = [{ ...baseTask, startedAt: "2026-09-01T10:00:00Z" }];
      const listB = [{ ...baseTask, startedAt: "2026-09-01T10:05:00Z" }];
      expect(areTasksEqual(listA, listB)).toBe(false);
    });

    it("returns false if errors differ", () => {
      const listA = [{ ...baseTask }];
      const listB = [{ ...baseTask, errors: ["Failed to compile"] }];
      expect(areTasksEqual(listA, listB)).toBe(false);
    });

    it("returns false if task count differs", () => {
      const listA = [{ ...baseTask }];
      const listB = [{ ...baseTask }, { ...baseTask, id: "TASK-002" }];
      expect(areTasksEqual(listA, listB)).toBe(false);
    });
  });

  describe("getSpecTaskCount", () => {
    it("returns 0 when tasks directory does not exist", () => {
      const count = getSpecTaskCount(gw, "non-existent-spec");
      expect(count).toBe(0);
    });

    it("returns 0 when tasks directory exists but is empty", () => {
      gw.mkdir(".codeforge/tasks/empty-spec");
      const count = getSpecTaskCount(gw, "empty-spec");
      expect(count).toBe(0);
    });

    it("counts only .json task definition files in the spec tasks directory", () => {
      gw.mkdir(".codeforge/tasks/auth-spec");
      gw.writeFile(".codeforge/tasks/auth-spec/TASK-001.json", "{}");
      gw.writeFile(".codeforge/tasks/auth-spec/TASK-002.json", "{}");
      gw.writeFile(".codeforge/tasks/auth-spec/README.md", "# Readme");
      gw.writeFile(".codeforge/tasks/auth-spec/notes.txt", "Notes");

      const count = getSpecTaskCount(gw, "auth-spec");
      expect(count).toBe(2);
    });

    it("handles errors gracefully and returns 0 when gateway throws", () => {
      const throwingGw = {
        exists: () => {
          throw new Error("Disk error");
        },
        listDir: () => [],
      } as unknown as InMemoryWorkspaceGateway;

      expect(getSpecTaskCount(throwingGw, "error-spec")).toBe(0);
    });
  });
});
