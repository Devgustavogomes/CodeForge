import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TaskOperationsUseCase } from "../../src/application/use-cases/TaskOperationsUseCase.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { FakeProcessExecutor } from "../helpers/fake-process-executor.js";
import { recordIntegration } from "../helpers/integrated-execution.js";
import { DAGResolver } from "../../src/scheduler/DAGResolver.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NodeGitGateway } from "../../src/infrastructure/git/NodeGitGateway.js";
import { WorktreeLifecycle } from "../../src/infrastructure/worktrees/WorktreeLifecycle.js";
import { TaskExecutor } from "../../src/scheduler/TaskExecutor.js";
import { PromptService } from "../../src/application/services/PromptService.js";
import { Task } from "../../src/domain/task.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/intents");
  gateway.mkdir(".codeforge/executions");
  gateway.mkdir(".codeforge/tasks/test-intent");
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
  gateway.writeFile(`.codeforge/tasks/test-intent/${id}.json`, JSON.stringify(task));
}

function setupExecutionState(gateway: InMemoryWorkspaceGateway, intentName: string, tasks: Partial<Task>[]) {
  const repo = new ExecutionStateRepository(gateway);
  const state = repo.init(intentName, tasks as Task[]);
  repo.save(state);
  return state;
}

describe("TaskOperationsUseCase", async () => {
  let gateway: InMemoryWorkspaceGateway;
  let repo: ExecutionStateRepository;
  let useCase: TaskOperationsUseCase;
  let processes: FakeProcessExecutor;

  beforeEach(async () => {
    gateway = new InMemoryWorkspaceGateway();
    repo = new ExecutionStateRepository(gateway);
    processes = new FakeProcessExecutor();
    useCase = new TaskOperationsUseCase(gateway, repo, processes);
  });

  describe("retryTask", async () => {
    it("blocks a running task without process evidence", async () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);

      // Simulate TaskScheduler initialization
      const state = setupExecutionState(gateway, "test-intent", [{ id: "TASK-001", title: "T", dependencies: [] }]);
      state.tasks["TASK-001"].status = "running";
      repo.save(state);

      const result = await useCase.retryTask("test-intent", "TASK-001");
      expect(result.kind).toBe("blocked");

      const newState = repo.load("test-intent")!;
      expect(newState.tasks["TASK-001"].status).toBe("running");
    });

    it("resets a failed task and changes state.status to pending", async () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);

      const state = setupExecutionState(gateway, "test-intent", [{ id: "TASK-001", title: "T", dependencies: [] }]);
      state.status = "failed";
      state.completedAt = new Date().toISOString();
      state.tasks["TASK-001"].status = "failed";
      repo.save(state);

      const result = await useCase.retryTask("test-intent", "TASK-001");
      expect(result.kind).toBe("retried");

      const newState = repo.load("test-intent")!;
      expect(newState.tasks["TASK-001"].status).toBe("pending");
      expect(newState.status).toBe("pending");
      expect(newState.completedAt).toBeUndefined();
    });

    it("fails when task is already pending", async () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);
      writeTask(gateway, "TASK-002", ["TASK-001"]);

      setupExecutionState(gateway, "test-intent", [{ id: "TASK-002", title: "T", dependencies: ["TASK-001"] }]);

      const result = await useCase.retryTask("test-intent", "TASK-002");
      expect(result.kind).toBe("already-pending");
    });

    it("fails when task is already completed", async () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);

      setupExecutionState(gateway, "test-intent", [{ id: "TASK-001", title: "T", dependencies: [] }]);
      repo.updateTask("test-intent", "TASK-001", task => { task.status = "completed"; });

      const result = await useCase.retryTask("test-intent", "TASK-001");
      expect(result.kind).toBe("already-completed");
    });

    it("fails when task does not exist", async () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);
      setupExecutionState(gateway, "test-intent", [{ id: "TASK-001", title: "T", dependencies: [] }]);

      const result = await useCase.retryTask("test-intent", "TASK-999");
      expect(result.kind).toBe("not-found");
    });
  });

  describe("markTaskCompleted", async () => {
    it("accepts an integrated result without claiming delivery", async () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);
      setupExecutionState(gateway, "test-intent", [{ id: "TASK-001", title: "T", dependencies: [] }]);

      recordIntegration(repo, "test-intent", "TASK-001");
      const result = useCase.markTaskCompleted("test-intent", "TASK-001");
      expect(result).toEqual({ kind: "completed", allCompleted: true });

      const updatedState = repo.load("test-intent")!;
      expect(updatedState.tasks["TASK-001"].status).toBe("completed");
      expect(updatedState.status).not.toBe("completed");
      expect(updatedState.delivery?.status).toBe("pending");
    });

    it("blocks manual completion without integrated evidence", async () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);
      writeTask(gateway, "TASK-002", ["TASK-001"]);

      expect(repo.load("test-intent")).toBeNull();

      const result = useCase.markTaskCompleted("test-intent", "TASK-001");
      expect(result.kind).toBe("blocked");

      const state = repo.load("test-intent")!;
      expect(state).toBeDefined();
      expect(state.tasks["TASK-001"].status).toBe("pending");
      expect(state.tasks["TASK-001"].completedAt).toBeUndefined();
      expect(new DAGResolver().getReadyTasks(state)).not.toContain("TASK-002");
      expect(state.tasks["TASK-002"].status).toBe("pending");
      expect(state.status).toBe("pending");
    });
  });

  describe("retryIntent / retryIntent", async () => {
    it("returns intent-not-found when intent does not exist", async () => {
      makeWorkspace(gateway);
      const result = await useCase.retryIntent("nonexistent");
      expect(result).toEqual({ kind: "intent-not-found" });
    });

    it("returns no-execution when execution state does not exist", async () => {
      makeWorkspace(gateway);
      const result = await useCase.retryIntent("test-intent");
      expect(result).toEqual({ kind: "no-execution", intentName: "test-intent", intentName: "test-intent" });
    });

    it("returns all-completed when all tasks are completed", async () => {
      makeWorkspace(gateway);
      const state = setupExecutionState(gateway, "test-intent", [
        { id: "TASK-001", title: "T1", dependencies: [] },
        { id: "TASK-002", title: "T2", dependencies: [] },
      ]);
      state.status = "completed";
      state.tasks["TASK-001"].status = "completed";
      state.tasks["TASK-002"].status = "completed";
      new ExecutionStateRepository(gateway).save(state);

      const result = await useCase.retryIntent("test-intent");
      expect(result).toEqual({ kind: "all-completed", intentName: "test-intent", intentName: "test-intent" });
    });

    it("returns no-failed-tasks with pendingCount when no tasks failed", async () => {
      makeWorkspace(gateway);
      const state = setupExecutionState(gateway, "test-intent", [
        { id: "TASK-001", title: "T1", dependencies: [] },
        { id: "TASK-002", title: "T2", dependencies: [] },
      ]);
      state.tasks["TASK-001"].status = "completed";
      state.tasks["TASK-002"].status = "pending";
      new ExecutionStateRepository(gateway).save(state);

      const result = await useCase.retryIntent("test-intent");
      expect(result).toEqual({
        kind: "no-failed-tasks",
        intentName: "test-intent",
        intentName: "test-intent",
        pendingCount: 1,
      });
    });

    it("resets failed tasks to pending, preserves timestamps and errors, and updates intent status", async () => {
      makeWorkspace(gateway);
      const state = setupExecutionState(gateway, "test-intent", [
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

      const result = await useCase.retryIntent("test-intent");
      expect(result).toEqual({
        kind: "retried",
        intentName: "test-intent",
        intentName: "test-intent",
        retriedTasks: ["TASK-001"],
      });

      const repo = new ExecutionStateRepository(gateway);
      const updatedState = repo.load("test-intent")!;
      expect(updatedState.status).toBe("pending");
      expect(updatedState.completedAt).toBeUndefined();
      expect(updatedState.startedAt).toBe("2026-09-01T09:00:00.000Z");

      expect(updatedState.tasks["TASK-001"].status).toBe("pending");
      expect(updatedState.tasks["TASK-001"].startedAt).toBe("2026-09-01T10:00:00.000Z");
      expect(updatedState.tasks["TASK-001"].completedAt).toBe("2026-09-01T10:05:00.000Z");
      expect(updatedState.tasks["TASK-001"].errors).toEqual([
        "SyntaxError: unexpected token",
        "Test failed",
      ]);

      expect(updatedState.tasks["TASK-002"].status).toBe("completed");
      expect(updatedState.tasks["TASK-002"].completedAt).toBe("2026-09-01T10:02:00.000Z");

      expect(updatedState.tasks["TASK-003"].status).toBe("pending");
    });
  });

  describe("resetTasks", async () => {
    it("returns intent-not-found when intent does not exist", async () => {
      makeWorkspace(gateway);
      const result = useCase.resetTasks("nonexistent");
      expect(result).toEqual({ kind: "intent-not-found" });

      const resultSingle = useCase.resetTasks("nonexistent", "TASK-001");
      expect(resultSingle).toEqual({ kind: "intent-not-found" });
    });

    it("returns no-execution when execution state does not exist", async () => {
      makeWorkspace(gateway);
      const result = useCase.resetTasks("test-intent");
      expect(result).toEqual({ kind: "no-execution", intentName: "test-intent", intentName: "test-intent" });

      const resultSingle = useCase.resetTasks("test-intent", "TASK-001");
      expect(resultSingle).toEqual({ kind: "no-execution", intentName: "test-intent", intentName: "test-intent" });
    });

    it("returns task-not-found when specified taskId does not exist", async () => {
      makeWorkspace(gateway);
      setupExecutionState(gateway, "test-intent", [{ id: "TASK-001", title: "T", dependencies: [] }]);

      const result = useCase.resetTasks("test-intent", "TASK-999");
      expect(result).toEqual({ kind: "task-not-found", taskId: "TASK-999" });
    });

    it("resets a single task, removing startedAt, completedAt, errors, and resets intent completedAt", async () => {
      makeWorkspace(gateway);
      const state = setupExecutionState(gateway, "test-intent", [
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

      const result = useCase.resetTasks("test-intent", "TASK-001");
      expect(result).toEqual({
        kind: "reset-single",
        intentName: "test-intent",
        intentName: "test-intent",
        taskId: "TASK-001",
      });

      const repo = new ExecutionStateRepository(gateway);
      const updatedState = repo.load("test-intent")!;
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

    it("resets all tasks when taskId is omitted, clearing all timestamps/errors and intent startedAt/completedAt", async () => {
      makeWorkspace(gateway);
      const state = setupExecutionState(gateway, "test-intent", [
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

      const result = useCase.resetTasks("test-intent");
      expect(result).toEqual({
        kind: "reset-all",
        intentName: "test-intent",
        intentName: "test-intent",
        count: 2,
      });

      const repo = new ExecutionStateRepository(gateway);
      const updatedState = repo.load("test-intent")!;
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

    it("auto-initializes execution state and resets task when state does not exist yet", async () => {
      makeWorkspace(gateway);
      writeTask(gateway, "TASK-001", []);

      expect(repo.load("test-intent")).toBeNull();

      const result = useCase.resetTasks("test-intent", "TASK-001");
      expect(result).toEqual({
        kind: "reset-single",
        intentName: "test-intent",
        intentName: "test-intent",
        taskId: "TASK-001",
      });

      const state = repo.load("test-intent")!;
      expect(state).toBeDefined();
      expect(state.tasks["TASK-001"].status).toBe("pending");
    });
  });
});


describe("worktree operation protections", () => {
  function setup() {
    const gateway = new InMemoryWorkspaceGateway();
    makeWorkspace(gateway);
    const repo = new ExecutionStateRepository(gateway);
    const state = setupExecutionState(gateway, "test-intent", [
      { id: "TASK-001", dependencies: [] }, { id: "TASK-002", dependencies: ["TASK-001"] },
    ]);
    const processes = new FakeProcessExecutor();
    const ops = new TaskOperationsUseCase(gateway, repo, processes);
    return { gateway, repo, state, processes, ops };
  }

  function processRecord(id: string) {
    return { id, host: "host", platform: "linux", bootId: "boot", token: id,
      command: "agent", args: [], cwd: "/owned/task", taskId: "TASK-001", intentName: "test-intent",
      startedAt: "2026-10-01", status: "exited" as const, identities: [], diagnostics: [] };
  }

  it.each(["preparation", "execution", "verification", "commit"] as const)(
    "retry preserves the owned worktree and %s evidence", async stage => {
      const { gateway, repo, state, ops } = setup();
      Object.assign(state.tasks["TASK-001"], { status: "failed", stage,
        branch: "codex/owned", worktreePath: "/owned/task", baseCommit: "base", attempt: 2,
        startedAt: "start", completedAt: "end", errors: ["previous failure"],
        diagnostics: [{ stage, message: "earlier diagnostic", recordedAt: "time" }],
        stages: { preparation: { status: stage === "preparation" ? "failed" : "succeeded" },
          [stage]: { status: "failed" } } });
      repo.save(state);
      gateway.writeFile("/owned/task/code.ts", "written code");
      const before = structuredClone(state.tasks["TASK-001"]);
      expect(await ops.retryTask("test-intent", "TASK-001")).toEqual({ kind: "retried" });
      expect(repo.load("test-intent")!.tasks["TASK-001"]).toEqual({ ...before, status: "pending" });
      expect(gateway.readFile("/owned/task/code.ts")).toBe("written code");
    },
  );

  it.each(["active", "unknown"] as const)("blocks %s ownership including exited parents", async status => {
    const { gateway, repo, state, processes, ops } = setup();
    state.tasks["TASK-001"].status = "failed";
    state.processes = [processRecord("old"), processRecord("new")];
    repo.save(state);
    processes.inspection = { status, safeToReuse: false, processes: [], diagnostics: ["surviving descendants"] };
    const before = new Map(gateway.files);
    expect((await ops.retryTask("test-intent", "TASK-001")).kind).toBe("blocked");
    expect(processes.inspections).toHaveLength(2);
    expect(gateway.files).toEqual(before);
  });

  it("retries a previously running task only after proving process absence", async () => {
    const { repo, state, ops } = setup();
    state.tasks["TASK-001"].status = "running";
    state.processes = [processRecord("old")];
    repo.save(state);
    expect((await ops.retryTask("test-intent", "TASK-001")).kind).toBe("retried");
    expect(repo.load("test-intent")!.processes).toEqual(state.processes);
  });

  it("checks every failed task before changing any intent state", async () => {
    const { gateway, repo, state, processes, ops } = setup();
    state.tasks["TASK-001"].status = "failed";
    state.tasks["TASK-002"].status = "failed";
    state.processes = [{ ...processRecord("active"), taskId: "TASK-002" }];
    repo.save(state);
    processes.inspection.safeToReuse = false;
    processes.inspection.status = "active";
    const before = new Map(gateway.files);
    expect((await ops.retryIntent("test-intent")).kind).toBe("blocked");
    expect(gateway.files).toEqual(before);
  });

  it("does not apply a stale retry after inspection races another state writer", async () => {
    const { repo, state, processes, ops } = setup();
    state.tasks["TASK-001"].status = "failed";
    state.processes = [processRecord("old")];
    repo.save(state);
    processes.inspect = async () => {
      repo.updateTask("test-intent", "TASK-001", task => { task.status = "running"; });
      return { status: "interrupted", safeToReuse: true, processes: [], diagnostics: [] };
    };
    expect((await ops.retryTask("test-intent", "TASK-001")).kind).toBe("blocked");
    expect(repo.load("test-intent")!.tasks["TASK-001"].status).toBe("running");
  });

  it("rejects manual completion with an approved but unintegrated commit", () => {
    const { gateway, repo, state, ops } = setup();
    state.tasks["TASK-001"].resultCommit = "approved";
    state.tasks["TASK-001"].integration = { status: "pending", resultCommit: "approved" };
    repo.save(state);
    const before = new Map(gateway.files);
    expect(ops.markTaskCompleted("test-intent", "TASK-001").kind).toBe("blocked");
    expect(gateway.files).toEqual(before);
    expect(new DAGResolver().getReadyTasks(repo.load("test-intent")!)).not.toContain("TASK-002");
    expect(repo.load("test-intent")!.delivery?.status).toBe("pending");
  });

  it.each([false, true])("rejects reset (all=%s) without partial changes to consumed results", all => {
    const { gateway, repo, ops } = setup();
    recordIntegration(repo, "test-intent", "TASK-001");
    repo.updateTask("test-intent", "TASK-001", task => { task.status = "completed"; });
    repo.updateTask("test-intent", "TASK-002", task => { task.baseCommit = "accepted-TASK-001"; });
    const before = new Map(gateway.files);
    const result = ops.resetTasks("test-intent", all ? undefined : "TASK-001");
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") expect(result.message).toContain("TASK-002");
    expect(gateway.files).toEqual(before);
  });

  it("rejects reset of failed recoverable work even without a consumer", () => {
    const { gateway, repo, state, ops } = setup();
    Object.assign(state.tasks["TASK-001"], { status: "failed", branch: "codex/owned", worktreePath: "/owned/task", errors: ["failure"] });
    repo.save(state);
    const before = new Map(gateway.files);
    expect(ops.resetTasks("test-intent").kind).toBe("blocked");
    expect(gateway.files).toEqual(before);
  });
});


describe("retry operations with real Git worktrees", () => {
  let checkout: string;
  const prefix = path.join(os.tmpdir(), "codeforge-operations-");
  const gitCommand = (...args: string[]) => execFileSync("git", args,
    { cwd: checkout, encoding: "utf8", windowsHide: true }).trim();

  beforeEach(() => {
    checkout = mkdtempSync(prefix);
    gitCommand("init");
    gitCommand("config", "user.name", "Tests");
    gitCommand("config", "user.email", "tests@example.com");
    writeFileSync(path.join(checkout, "base.txt"), "base");
    gitCommand("add", "--all");
    gitCommand("commit", "-m", "base");
  });
  afterEach(() => {
    if (!path.resolve(checkout).startsWith(path.resolve(prefix))) throw new Error("Unexpected temporary checkout path");
    rmSync(checkout, { recursive: true, force: true });
  });

  it.each(["preparation", "execution"])("continues after %s failure in the same worktree with earlier diagnostics", async failure => {
    const gateway = new InMemoryWorkspaceGateway();
    makeWorkspace(gateway);
    writeTask(gateway, "TASK-001");
    const task = JSON.parse(gateway.readFile(".codeforge/tasks/test-intent/TASK-001.json")) as Task;
    const repo = new ExecutionStateRepository(gateway);
    const git = new NodeGitGateway(checkout);
    const processes = new FakeProcessExecutor();
    let preparationCalls = 0;
    // These fake commands have no OS descendants; real process inspection is tested separately.
    processes.exec = async (_command, options) => {
      if (options?.taskId) {
        preparationCalls++;
        if (failure === "preparation" && preparationCalls === 1) {
          writeFileSync(path.join(options.cwd!, "written.ts"), "preserved code");
          return { exitCode: 1, stdout: "", stderr: "npm ci diagnostic" };
        }
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const lifecycle = new WorktreeLifecycle(git, processes, repo);
    await lifecycle.initializeRun("test-intent", [task], checkout);
    const prompts = new PromptService(gateway);
    const promptSpy = vi.spyOn(prompts, "createPromptFile");
    let executions = 0;
    const runner = { execute: vi.fn(async (context: { cwd?: string }) => {
      executions++;
      const file = path.join(context.cwd!, "written.ts");
      if (failure === "execution" && executions === 1) {
        writeFileSync(file, "preserved code");
        throw new Error("agent diagnostic");
      }
      expect(readFileSync(file, "utf8")).toBe("preserved code");
      writeFileSync(path.join(context.cwd!, "finished.ts"), "finished");
    }) };
    const executor = new TaskExecutor(runner,
      { environment: "test", plannerAgent: "p", executorAgent: "e", language: "en" },
      repo, prompts, checkout, git);
    const execute = () => executor.executeTask("test-intent", task, {
      cwd: checkout,
      prepareWorktree: () => lifecycle.prepareTask("test-intent", task.id, lifecycle.getIntegrationCommit("test-intent")),
    });
    await execute();
    const prior = repo.load("test-intent")!.tasks[task.id];
    expect(prior.status).toBe("failed");
    expect(readFileSync(path.join(prior.worktreePath!, "written.ts"), "utf8")).toBe("preserved code");
    expect((await new TaskOperationsUseCase(gateway, repo, processes).retryTask("test-intent", task.id)).kind).toBe("retried");
    await execute();
    const completed = repo.load("test-intent")!.tasks[task.id];
    expect(completed.status).toBe("completed");
    expect(completed.branch).toBe(prior.branch);
    expect(completed.worktreePath).toBe(prior.worktreePath);
    expect(completed.baseCommit).toBe(prior.baseCommit);
    expect(preparationCalls).toBe(failure === "preparation" ? 2 : 1);
    expect(completed.diagnostics).toEqual(expect.arrayContaining(prior.diagnostics!));
    expect(promptSpy.mock.calls.at(-1)![3]).toEqual(expect.arrayContaining([
      expect.stringContaining(failure === "preparation" ? "npm ci diagnostic" : "agent diagnostic"),
    ]));
    expect(git.listWorktrees(checkout).filter(item => item.branch === prior.branch)).toHaveLength(1);
    expect(readFileSync(path.join(checkout, "base.txt"), "utf8")).toBe("base");
  }, 30000);
});
