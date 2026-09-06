import { describe, it, expect } from "vitest";
import { formatStatusOutput } from "../../../src/cli/ui/statusFormatter.js";

describe("formatStatusOutput", () => {
  it("shows progress bar and task list", () => {
    const output = formatStatusOutput({
      kind: "status",
      specName: "todo-api",
      specStatus: "running",
      tasks: [
        { id: "TASK-001", title: "Setup", status: "completed", dependencies: [] },
        { id: "TASK-002", title: "Routes", status: "running", dependencies: ["TASK-001"] },
        { id: "TASK-003", title: "Tests", status: "pending", dependencies: ["TASK-002"] },
      ],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(output).toContain("todo-api");
    expect(output).toContain("TASK-001");
    expect(output).toContain("TASK-002");
    expect(output).toContain("TASK-003");
    expect(output).toContain("33%");
    expect(output).toContain("1/3");
  });

  it("shows 100% when all tasks completed", () => {
    const output = formatStatusOutput({
      kind: "status",
      specName: "test",
      specStatus: "completed",
      tasks: [
        { id: "TASK-001", title: "Done", status: "completed", dependencies: [] },
      ],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(output).toContain("100%");
    expect(output).toContain("1/1");
  });
});
