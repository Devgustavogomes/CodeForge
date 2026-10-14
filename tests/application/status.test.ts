import { formatPlainTextStatus } from "../../src/cli/ui/statusFormatter.js";
import { areTasksEqual, loadTasksFromDisk } from "../../src/cli/tui/context/ExecutionContext/taskLoader.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { GetIntentStatusUseCase, TaskStatusInfo } from "../../src/application/use-cases/GetIntentStatusUseCase.js";
import { IntentExecutionState } from "../../src/domain/execution.js";
import { PATHS } from "../../src/infrastructure/paths.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(PATHS.intentsDir);
  gateway.mkdir(".codeforge/tasks/test-intent");
  gateway.mkdir(PATHS.executionsDir);
  gateway.writeFile(PATHS.metadata, JSON.stringify({ initialized: true }));
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
  gateway.writeFile(`.codeforge/tasks/test-intent/${id}.json`, JSON.stringify(task));
}

function writeState(gateway: InMemoryWorkspaceGateway, state: IntentExecutionState) {
  gateway.writeFile(PATHS.executionState(state.intentId), JSON.stringify(state, null, 2));
}

describe("GetIntentStatusUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let useCase: GetIntentStatusUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    useCase = new GetIntentStatusUseCase(gateway);
  });

  it("projects approval, pending delivery, ownership and retained conflict diagnostics", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", "Feature");
    const state: IntentExecutionState = {
      schemaVersion: 2, runId: "run", intentId: "test-intent", status: "paused", updatedAt: "2026-01-01",
      repositoryPath: "/repo", integrationBranch: "codex/integration", integrationWorktreePath: "/integration",
      lastAcceptedCommit: "base", delivery: { status: "pending" },
      diagnostics: [{ stage: "delivery", message: "Original index changed; preserve user work before retrying.", recordedAt: "2026-01-01" }],
      owner: { pid: 123, host: "host", token: "token", startedAt: "2026-01-01" },
      tasks: { "TASK-001": { status: "completed", dependencies: [], branch: "codex/task", worktreePath: "/task",
        baseCommit: "base", resultCommit: "result", integration: { status: "blocked", resolution: {
          id: "conflict-op", incomingCommit: "result", lastAcceptedCommit: "base", worktreePath: "/integration",
          attempts: 2, status: "exhausted", conflicts: ["file.ts"], diagnostics: ["Verification failed twice"],
        } }, diagnostics: [{ stage: "recovery", message: "Execution interrupted; resume in existing worktree.", recordedAt: "2026-01-01" }] } },
    };
    writeState(gateway, state);
    const result = useCase.execute("test-intent");
    expect(result.kind).toBe("status");
    if (result.kind !== "status") return;
    expect(result.delivered).toBe(false);
    expect(result.tasks[0]).toMatchObject({ resultCommit: "result", integrated: false, integration: { status: "blocked" } });
    const output = formatPlainTextStatus(result);
    for (const text of ["Approval: approved", "Integration: blocked", "Delivery: pending", "codex/integration", "/task", "Original index changed", "PID 123", "attempts 2/2", "file.ts", "conflict-op", "Execution interrupted"]) expect(output).toContain(text);
    const repo = new ExecutionStateRepository(gateway);
    const before = loadTasksFromDisk(gateway, repo, "test-intent");
    expect(before[0].integration?.resolution?.attempts).toBe(2);
    repo.updateTask("test-intent", "TASK-001", task => { task.integration!.status = "pending"; });
    expect(areTasksEqual(before, loadTasksFromDisk(gateway, repo, "test-intent"))).toBe(false);
  });

  it("keeps delivered results successful when cleanup fails", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", "Feature");
    writeState(gateway, {
      schemaVersion: 2, runId: "run", intentId: "test-intent", status: "completed", updatedAt: "2026-01-01",
      repositoryPath: "/repo", integrationBranch: "codex/integration", integrationWorktreePath: "/integration",
      lastAcceptedCommit: "accepted", delivery: { status: "succeeded", deliveredCommit: "accepted" },
      cleanup: [{ status: "failed", branch: "codex/task", worktreePath: "/task" }],
      diagnostics: [{ stage: "cleanup", message: "Dirty worktree retained", recordedAt: "2026-01-01" }],
      tasks: { "TASK-001": { status: "completed", dependencies: [], branch: "codex/task", worktreePath: "/task",
        baseCommit: "base", resultCommit: "result", integration: { status: "succeeded", resultCommit: "result", acceptedCommit: "accepted" } } },
    });
    const result = useCase.execute("test-intent");
    if (result.kind !== "status") throw new Error("Missing status");
    expect(result.delivered).toBe(true);
    expect(result.tasks[0].integrated).toBe(true);
    expect(formatPlainTextStatus(result)).toContain("Delivery: delivered");
    expect(formatPlainTextStatus(result)).toContain("Cleanup: failed");
    expect(formatPlainTextStatus(result)).toContain("Dirty worktree retained");
  });

  it("returns notInitialized when metadata is missing", () => {
    const result = useCase.execute("test-intent");
    expect(result.kind).toBe("not-initialized");
  });

  it("returns intentNotFound when tasks directory is missing", () => {
    makeWorkspace(gateway);
    const result = useCase.execute("nonexistent");
    expect(result.kind).toBe("intent-not-found");
  });

  it("returns noExecution when no execution state exists", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", "Setup", []);
    const result = useCase.execute("test-intent");
    expect(result.kind).toBe("no-execution");
  });

  it("returns task statuses from execution state", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001", "Setup project", []);
    writeTask(gateway, "TASK-002", "Configure DB", ["TASK-001"]);

    writeState(gateway, {
      intentId: "test-intent",
      status: "running",
      tasks: {
        "TASK-001": { status: "completed", dependencies: [] },
        "TASK-002": { status: "running", dependencies: ["TASK-001"] },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = useCase.execute("test-intent");
    expect(result.kind).toBe("status");
    if (result.kind === "status") {
      expect(result.intentStatus).toBe("running");
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0]).toMatchObject({
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
      intentId: "test-intent",
      status: "running",
      tasks: {
        "TASK-001": { status: "completed", dependencies: [] },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = useCase.execute("test-intent");
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
      intentId: "test-intent",
      status: "running",
      tasks: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = useCase.execute("test-intent");
    expect(result.kind).toBe("status");
    if (result.kind === "status") {
      expect(result.tasks.map((t: TaskStatusInfo) => t.id)).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
    }
  });
});
