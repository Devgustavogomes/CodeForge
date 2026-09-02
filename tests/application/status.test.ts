import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { GetSpecStatusUseCase, formatStatusOutput, TaskStatusInfo } from "../../src/application/use-cases/GetSpecStatusUseCase.js";
import { SpecExecutionState } from "../../src/domain/execution.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/specs");
  gateway.mkdir(".codeforge/tasks/test-spec");
  gateway.mkdir(".codeforge/executions");
  gateway.writeFile(".codeforge/metadata.json", JSON.stringify({ initialized: true }));
}

function writeTask(gateway: InMemoryWorkspaceGateway, id: string, title: string, deps: string[] = []) {
  const task = {
    id,
    title,
    objective: "O",
    context: "C",
    implementation: "I",
    files: [],
    dependencies: deps,
    constraints: [],
    acceptanceCriteria: [],
  };
  gateway.writeFile(`.codeforge/tasks/test-spec/${id}.json`, JSON.stringify(task));
}

function writeState(gateway: InMemoryWorkspaceGateway, state: SpecExecutionState) {
  gateway.writeFile(`.codeforge/executions/${state.specId}.json`, JSON.stringify(state, null, 2));
}

describe("GetSpecStatusUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let useCase: GetSpecStatusUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    useCase = new GetSpecStatusUseCase(gateway);
  });

  it("returns notInitialized when metadata is missing", () => {
    const result = useCase.execute("test-spec");
    expect(result.kind).toBe("not-initialized");
  });

  it("returns specNotFound when tasks directory is missing", () => {
    makeWorkspace(gateway);
    const result = useCase.execute("nonexistent");
    expect(result.kind).toBe("spec-not-found");
  });

  it("returns noExecution when no execution state exists", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", "Setup", []);
    const result = useCase.execute("test-spec");
    expect(result.kind).toBe("no-execution");
  });

  it("returns task statuses from execution state", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", "Setup project", []);
    writeTask(gateway, "TASK-002", "Configure DB", ["TASK-001"]);

    writeState(gateway, {
      specId: "test-spec",
      status: "running",
      tasks: {
        "TASK-001": { status: "completed", dependencies: [] },
        "TASK-002": { status: "running", dependencies: ["TASK-001"] },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = useCase.execute("test-spec");
    expect(result.kind).toBe("status");
    if (result.kind === "status") {
      expect(result.specStatus).toBe("running");
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0]).toEqual({
        id: "TASK-001",
        title: "Setup project",
        status: "completed",
        dependencies: [],
        startedAt: undefined,
        completedAt: undefined,
        errors: undefined,
      });
      expect(result.tasks[1].status).toBe("running");
    }
  });

  it("defaults missing task state to pending", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", "Setup", []);
    writeTask(gateway, "TASK-002", "Configure DB", []);

    // Execution state only contains TASK-001
    writeState(gateway, {
      specId: "test-spec",
      status: "running",
      tasks: {
        "TASK-001": { status: "completed", dependencies: [] },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = useCase.execute("test-spec");
    expect(result.kind).toBe("status");
    if (result.kind === "status") {
      const task2 = result.tasks.find((t) => t.id === "TASK-002");
      expect(task2?.status).toBe("pending");
    }
  });

  it("sorts tasks consistently by id", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-003", "Third", []);
    writeTask(gateway, "TASK-001", "First", []);
    writeTask(gateway, "TASK-002", "Second", []);

    writeState(gateway, {
      specId: "test-spec",
      status: "running",
      tasks: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = useCase.execute("test-spec");
    expect(result.kind).toBe("status");
    if (result.kind === "status") {
      expect(result.tasks.map((t: TaskStatusInfo) => t.id)).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
    }
  });
});

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
