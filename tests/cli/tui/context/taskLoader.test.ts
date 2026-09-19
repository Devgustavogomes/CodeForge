import { describe, it, expect, beforeEach } from "vitest";
import {
  loadTasksFromDisk,
  areTasksEqual,
  getIntentTaskCount,
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
    gw.mkdir(".codeforge/tasks/auth-intent");
    const task1: Task = {
      id: "TASK-001",
      title: "Login page",
      dependencies: [],
      objective: "Build login",
    };
    gw.writeFile(
      ".codeforge/tasks/auth-intent/TASK-001.json",
      JSON.stringify(task1),
    );

    const state = stateRepo.init("auth-intent", [task1]);
    state.tasks["TASK-001"].status = "completed";
    state.tasks["TASK-001"].completedAt = "2026-09-01T12:00:00Z";
    stateRepo.save(state);

    const items = loadTasksFromDisk(gw, stateRepo, "auth-intent");
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
    const state = stateRepo.init("orphaned-intent", []);
    state.tasks["TASK-GHOST"] = {
      title: "Ghost task",
      status: "failed",
      dependencies: [],
      errors: ["Missing file"],
    };
    stateRepo.save(state);

    const items = loadTasksFromDisk(gw, stateRepo, "orphaned-intent");
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

  describe("getIntentTaskCount", () => {
    it("returns 0 when tasks directory does not exist", () => {
      const count = getIntentTaskCount(gw, "non-existent-intent");
      expect(count).toBe(0);
    });

    it("returns 0 when tasks directory exists but is empty", () => {
      gw.mkdir(".codeforge/tasks/empty-intent");
      const count = getIntentTaskCount(gw, "empty-intent");
      expect(count).toBe(0);
    });

    it("counts only .json task definition files in the intent tasks directory", () => {
      gw.mkdir(".codeforge/tasks/auth-intent");
      gw.writeFile(".codeforge/tasks/auth-intent/TASK-001.json", "{}");
      gw.writeFile(".codeforge/tasks/auth-intent/TASK-002.json", "{}");
      gw.writeFile(".codeforge/tasks/auth-intent/README.md", "# Readme");
      gw.writeFile(".codeforge/tasks/auth-intent/notes.txt", "Notes");

      const count = getIntentTaskCount(gw, "auth-intent");
      expect(count).toBe(2);
    });

    it("handles errors gracefully and returns 0 when gateway throws", () => {
      const throwingGw = {
        exists: () => {
          throw new Error("Disk error");
        },
        listDir: () => [],
      } as unknown as InMemoryWorkspaceGateway;

      expect(getIntentTaskCount(throwingGw, "error-intent")).toBe(0);
    });
  });
});
