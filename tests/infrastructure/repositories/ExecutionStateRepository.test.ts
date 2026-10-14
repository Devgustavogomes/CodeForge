import { FakeProcessExecutor } from "../../helpers/fake-process-executor.js";
import ts from "typescript";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NodeWorkspaceGateway } from "../../../src/infrastructure/workspace.js";
import { DAGResolver } from "../../../src/scheduler/DAGResolver.js";
import { ExecutionOperation } from "../../../src/domain/execution.js";
import { describe, it, expect, beforeEach, vi } from "vitest";
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

    expect(repo.load("legacy")).toMatchObject({
      recovery: "legacy-evidence-required",
      revision: 0,
      intentId: "legacy",
      status: "completed",
      tasks: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});


describe("recoverable execution transitions", () => {
  it("rejects stale snapshots without losing either task's diagnostics", () => {
    const gw = new InMemoryWorkspaceGateway();
    const first = new ExecutionStateRepository(gw);
    const second = new ExecutionStateRepository(gw);
    first.save(first.init("run", [mockTask("A", "A"), mockTask("B", "B")]));
    const stale = second.load("run")!;
    first.updateTask("run", "A", (task) => {
      task.resultCommit = "result-a";
      task.errors = ["diagnostic-a"];
    });
    stale.tasks.B.resultCommit = "result-b";
    expect(() => second.save(stale)).toThrow("Execution state changed");
    second.updateTask("run", "B", (task) => {
      task.resultCommit = "result-b";
      task.errors = ["diagnostic-b"];
    });
    expect(first.load("run")?.tasks).toMatchObject({
      A: { resultCommit: "result-a", errors: ["diagnostic-a"] },
      B: { resultCommit: "result-b", errors: ["diagnostic-b"] },
    });
  });

  it("serializes updates from independent OS processes at the central state path", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-state-"));
    try {
      const repo = new ExecutionStateRepository(new NodeWorkspaceGateway(directory));
      repo.save(repo.init("run", [mockTask("A", "A"), mockTask("B", "B")]));
      // Compile the fixture modules without relying on a child-process TS loader.
      for (const file of ["infrastructure/repositories/ExecutionStateRepository", "infrastructure/workspace", "infrastructure/paths", "domain/execution"]) {
        const source = fs.readFileSync(new URL("../../../src/" + file + ".ts", import.meta.url), "utf8");
        const output = path.join(directory, file + ".mjs");
        fs.mkdirSync(path.dirname(output), { recursive: true });
        const compiled = ts.transpileModule(source, { compilerOptions: {
          target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
        } }).outputText.replaceAll(".js\"", ".mjs\"");
        fs.writeFileSync(output, compiled);
      }
      const repositoryUrl = pathToFileURL(path.join(directory, "infrastructure/repositories/ExecutionStateRepository.mjs")).href;
      const workspaceUrl = pathToFileURL(path.join(directory, "infrastructure/workspace.mjs")).href;
      await Promise.all(["A", "B"].map((id) => {
        const script = `import { ExecutionStateRepository } from ${JSON.stringify(repositoryUrl)};
          import { NodeWorkspaceGateway } from ${JSON.stringify(workspaceUrl)};
          const repo = new ExecutionStateRepository(new NodeWorkspaceGateway(${JSON.stringify(directory)}));
          repo.updateTask("run", ${JSON.stringify(id)}, (task) => {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
            task.resultCommit = ${JSON.stringify("result-" + id)};
            task.diagnostics.push({stage:"verification",message:${JSON.stringify("diagnostic-" + id)},recordedAt:new Date().toISOString()});
          });`;
        return promisify(execFile)(process.execPath, ["--input-type=module", "-e", script]);
      }));
      const state = repo.load("run")!;
      for (const id of ["A", "B"]) {
        expect(state.tasks[id].resultCommit).toBe("result-" + id);
        expect(state.tasks[id].diagnostics?.[0].message).toBe("diagnostic-" + id);
      }
      expect(state.revision).toBe(3);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }, 15000);

  it("keeps the previous complete record when atomic replacement is interrupted", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-state-"));
    try {
      const repo = new ExecutionStateRepository(new NodeWorkspaceGateway(directory));
      const original = repo.init("run", [mockTask("A", "A")]);
      repo.save(original);
      const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("interrupted"); });
      try {
        expect(() => repo.updateTask("run", "A", (task) => { task.status = "failed"; })).toThrow("interrupted");
        expect(repo.load("run")).toEqual(original);
      } finally { rename.mockRestore(); }
      repo.updateTask("run", "A", (task) => { task.status = "completed"; });
      expect(repo.load("run")?.tasks.A.status).toBe("completed");
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(["commit", "integration", "delivery", "cleanup"] as const)("retains %s intent and observed before/after identities", (kind) => {
    const gw = new InMemoryWorkspaceGateway();
    const repo = new ExecutionStateRepository(gw);
    const state = repo.init("run", [mockTask("A", "A")]);
    repo.save(state);
    const before = { repositoryPath: "C:/repo", branch: "codex/run", worktreePath: "C:/worktree", headCommit: "before" };
    const operation: ExecutionOperation = {
      id: "op", runId: state.runId!, taskId: "A", attempt: 1, kind, status: "intended",
      intendedAt: "2026-01-01T00:00:00Z", before,
      source: { ...before, branch: "codex/task", headCommit: "result" },
      expectedAfter: { ...before, headCommit: "after", exists: kind !== "cleanup" },
    };
    repo.recordOperationIntent("run", operation);
    const resumed = new ExecutionStateRepository(gw);
    expect(resumed.load("run")?.operations).toEqual([operation]);
    resumed.recordOperationOutcome("run", "op", "succeeded", {
      recordedAt: "2026-01-01T00:01:00Z", after: operation.expectedAfter,
    });
    expect(repo.load("run")?.operations?.[0]).toMatchObject({
      ...operation, status: "succeeded", outcome: { after: operation.expectedAfter },
    });
    expect(() => repo.update("run", (record) => { record.operations = []; })).toThrow("cannot be discarded");
    expect(() => repo.update("run", (record) => { record.operations![0].before.headCommit = "other"; })).toThrow("cannot be rewritten");
  });

  it("preserves removed execution records and rejects replacement runs", () => {
    const repo = new ExecutionStateRepository(new InMemoryWorkspaceGateway());
    repo.save(repo.init("run", [mockTask("A", "A")]));
    repo.updateTask("run", "A", (task) => { task.resultCommit = "recoverable"; });
    repo.update("run", (state) => { delete state.tasks.A; });
    expect(repo.load("run")?.archivedTasks?.A[0].resultCommit).toBe("recoverable");
    expect(() => repo.init("run", [])).toThrow("Execution already exists");
  });

  it("requires integration evidence to release dependencies, including legacy completion", () => {
    const gw = new InMemoryWorkspaceGateway();
    const repo = new ExecutionStateRepository(gw);
    gw.writeFile(PATHS.executionState("legacy"), JSON.stringify({
      intentId: "legacy", status: "running", updatedAt: "old",
      tasks: { A: { status: "completed", dependencies: [] }, B: { status: "pending", dependencies: ["A"] } },
    }));
    const legacy = repo.load("legacy")!;
    expect(new DAGResolver().getReadyTasks(legacy)).toEqual([]);
    repo.save(legacy);
    expect(repo.load("legacy")?.recovery).toBe("legacy-evidence-required");
    expect(repo.load("legacy")?.runId).toBeUndefined();
    const state = repo.init("modern", [mockTask("A", "A"), mockTask("B", "B", ["A"])]);
    state.tasks.A.status = "completed";
    expect(new DAGResolver().getReadyTasks(state)).toEqual([]);
    Object.assign(state, { repositoryPath: "repo", integrationBranch: "codex/run", integrationWorktreePath: "integration" });
    Object.assign(state.tasks.A, { branch: "codex/task", worktreePath: "task", baseCommit: "base", resultCommit: "result",
      integration: { status: "succeeded", acceptedCommit: "accepted", resultCommit: "result" } });
    expect(new DAGResolver().getReadyTasks(state)).toEqual(["B"]);
    expect(state.delivery?.status).toBe("pending");
  });
});


it("uses the central execution workspace when called from a task worktree", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-central-"));
  try {
    const taskDirectory = path.join(directory, "worktree");
    const central = new ExecutionStateRepository(new NodeWorkspaceGateway(directory));
    central.save(central.init("run", [mockTask("A", "A")]));
    const task = new ExecutionStateRepository(new NodeWorkspaceGateway(taskDirectory, directory));
    task.updateTask("run", "A", (record) => { record.errors = ["central diagnostic"]; });
    expect(central.load("run")?.tasks.A.errors).toEqual(["central diagnostic"]);
    expect(fs.existsSync(path.join(taskDirectory, PATHS.executionState("run")))).toBe(false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});


describe("persisted process recovery", () => {
  function setup() {
    const gw = new InMemoryWorkspaceGateway();
    const repo = new ExecutionStateRepository(gw);
    const state = repo.init("run", [mockTask("A", "A")]);
    state.tasks.A.status = "running";
    state.tasks.A.stage = "preparation";
    repo.save(state);
    return { gw, repo, process: new FakeProcessExecutor() };
  }
  it("a new repository can inspect preparation launch and termination records", async () => {
    const { gw, repo, process } = setup();
    await process.exec("npm ci", { cwd: "worktree", intentName: "run", taskId: "A", kind: "preparation",
      onProcessRecord: repo.processReporter("run") });
    const resumed = new ExecutionStateRepository(gw);
    expect(resumed.load("run")?.processes).toHaveLength(1);
    expect(resumed.load("run")?.processes?.[0]).toMatchObject({ status: "exited", kind: "preparation", exitCode: 0 });
    await resumed.reconcileProcesses("run", process);
    expect(resumed.load("run")?.tasks.A).toMatchObject({ status: "failed", stages: { preparation: { status: "failed" } } });
    expect((await resumed.inspectEnvironment("run", process, { taskId: "A" })).safeToReuse).toBe(true);
    expect(() => resumed.update("run", state => { state.processes = []; })).toThrow("cannot be discarded");
    expect(() => resumed.update("run", state => { state.processes![0].token = "reused"; })).toThrow("cannot be rewritten");
  });
  it("does not settle occupied tasks even when the parent has exited", async () => {
    const { repo, process } = setup();
    await process.spawn("agent", [], { intentName: "run", taskId: "A", onProcessRecord: repo.processReporter("run") });
    process.inspection = { status: "active", safeToReuse: false, processes: [{ pid: 90, parentPid: 1, birth: "child" }], diagnostics: [] };
    expect((await repo.reconcileProcesses("run", process)).tasks.A.status).toBe("running");
    expect((await repo.inspectEnvironment("run", process, { taskId: "A" })).safeToReuse).toBe(false);
  });
  it("settles missing evidence as blocked with an actionable recovery diagnostic", async () => {
    const { repo, process } = setup();
    const state = await repo.reconcileProcesses("run", process);
    expect(state.tasks.A).toMatchObject({ status: "failed", stages: { preparation: { status: "blocked" } } });
    expect(state.tasks.A.errors?.[0]).toContain("No process launch evidence");
    expect((await repo.inspectEnvironment("run", process)).safeToReuse).toBe(false);
  });
  it("records interruption for a dead agent and settles a running conflict resolution stage", async () => {
    const { repo, process } = setup();
    await process.spawn("resolver", [], { intentName: "run", taskId: "A", kind: "conflict-resolution",
      cwd: "integration", onProcessRecord: repo.processReporter("run") });
    repo.update("run", state => {
      state.integrationWorktreePath = "integration";
      state.tasks.A.status = "completed";
      state.tasks.A.integration = { status: "running" };
      // Simulate an orchestrator that recorded launch, but exited before recording termination.
      const record = structuredClone(state.processes![0]);
      record.id = "orphan"; record.token = "orphan";
      record.status = "running"; delete record.endedAt; delete record.exitCode;
      state.processes!.push(record);
    });
    const state = await repo.reconcileProcesses("run", process);
    expect(state.tasks.A).toMatchObject({ status: "completed", integration: { status: "failed" } });
    expect(state.processes?.find(record => record.id === "orphan")).toMatchObject({ status: "interrupted", exitCode: null });
  });

  it("inspection failure prevents environment reuse", async () => {
    const { repo, process } = setup();
    await process.spawn("resolver", [], { intentName: "run", kind: "conflict-resolution",
      cwd: "integration", onProcessRecord: repo.processReporter("run") });
    vi.spyOn(process, "inspect").mockRejectedValue(new Error("access denied"));
    expect(await repo.inspectEnvironment("run", process, { cwd: "integration" })).toMatchObject({
      safeToReuse: false, status: "unknown", diagnostics: [expect.stringContaining("access denied")],
    });
  });
});
