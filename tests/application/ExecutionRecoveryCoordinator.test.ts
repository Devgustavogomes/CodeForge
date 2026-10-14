import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExecutionRecoveryCoordinator } from "../../src/scheduler/ExecutionRecoveryCoordinator.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { NodeGitGateway } from "../../src/infrastructure/git/NodeGitGateway.js";
import { FakeProcessExecutor } from "../helpers/fake-process-executor.js";
import { TaskBuilder } from "../helpers/task-builder.js";
import { ExecutionOperation, GitIdentity } from "../../src/domain/execution.js";
import { IntegrationCoordinator } from "../../src/scheduler/IntegrationCoordinator.js";

describe("ExecutionRecoveryCoordinator", { timeout: 30000 }, () => {
  let directory: string;
  let repo: ExecutionStateRepository;
  let git: NodeGitGateway;
  let processes: FakeProcessExecutor;
  let recovery: ExecutionRecoveryCoordinator;
  let base: string;
  let taskPath: string;
  let integrationPath: string;
  const command = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  const identity = (cwd: string): GitIdentity => ({ repositoryPath: directory,
    branch: git.getRepositoryInfo(cwd).branch!, worktreePath: cwd, headCommit: git.getRepositoryInfo(cwd).head, exists: true });
  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), "codeforge-recovery-"));
    command(directory, "init", "-b", "main");
    command(directory, "config", "user.name", "Recovery Test");
    command(directory, "config", "user.email", "recovery@example.com");
    writeFileSync(path.join(directory, ".gitignore"), ".codeforge/\n");
    writeFileSync(path.join(directory, "shared.txt"), "base\n");
    command(directory, "add", "."); command(directory, "commit", "-m", "base");
    base = command(directory, "rev-parse", "HEAD");
    git = new NodeGitGateway(directory);
    repo = new ExecutionStateRepository(new NodeWorkspaceGateway(directory));
    processes = new FakeProcessExecutor();
    recovery = new ExecutionRecoveryCoordinator(repo, git, processes, () => true);
    const state = repo.init("run", [TaskBuilder.aTask().withId("A").build(), TaskBuilder.aTask().withId("B").build()]);
    const integration = git.createWorktree(directory, state.runId!, "integration", base);
    const task = git.createWorktree(directory, state.runId!, "A", base);
    integrationPath = integration.directory; taskPath = task.directory;
    Object.assign(state, { repositoryPath: directory, originalWorktreePath: directory, originalBranch: "main", originalCommit: base,
      integrationBranch: integration.branch, integrationWorktreePath: integrationPath, lastAcceptedCommit: base });
    Object.assign(state.tasks.A, { branch: task.branch, worktreePath: taskPath, baseCommit: base, status: "running", stage: "commit",
      stages: { preparation: { status: "succeeded" }, verification: { status: "succeeded" }, commit: { status: "running" } } });
    state.tasks.B.dependencies = ["A"];
    repo.save(state);
  });
  afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

  function operation(kind: ExecutionOperation["kind"], cwd: string, taskId?: string): ExecutionOperation {
    const before = identity(cwd);
    const op: ExecutionOperation = { id: kind + "-op", kind, taskId, runId: repo.load("run")!.runId!, attempt: 1,
      status: "intended", intendedAt: new Date().toISOString(), before, expectedAfter: { ...before, headCommit: null } };
    return op;
  }
  function committed(): string {
    const op = operation("commit", taskPath, "A");
    repo.recordOperationIntent("run", op);
    writeFileSync(path.join(taskPath, "A.txt"), "approved result");
    git.stageAll(taskPath);
    return git.commit(taskPath, "result\n\nCodeForge-Operation: " + op.id);
  }
  async function merged(): Promise<string> {
    const result = committed();
    expect(await recovery.reconcile("run")).toEqual({ ready: true });
    const op = operation("integration", integrationPath, "A"); op.source = identity(taskPath);
    repo.recordOperationIntent("run", op);
    repo.updateTask("run", "A", task => { task.integration = { status: "running", resultCommit: result, operationId: op.id }; });
    return git.integrate(integrationPath, result).head;
  }
  function processRecord() {
    return { id: "agent", token: "token", host: os.hostname(), platform: process.platform, command: "agent", args: [],
      cwd: taskPath, taskId: "A", intentName: "run", startedAt: new Date().toISOString(), status: "running" as const,
      identities: [], diagnostics: [], pid: 12345 };
  }

  it("recovers a commit created before state save, without creating another commit", async () => {
    const result = committed();
    const mutate = vi.spyOn(git, "commit");
    expect(await recovery.reconcile("run")).toEqual({ ready: true });
    expect(repo.load("run")!.tasks.A).toMatchObject({ status: "completed", resultCommit: result, integration: { status: "pending" } });
    expect(repo.load("run")!.operations![0]).toMatchObject({ status: "succeeded", outcome: { after: { headCommit: result } } });
    expect(await recovery.reconcile("run")).toEqual({ ready: true });
    expect(repo.load("run")!.operations).toHaveLength(1);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("recognizes an interrupted successful integration exactly once before releasing dependents", async () => {
    const head = await merged();
    expect(repo.load("run")!.tasks.A.integration!.status).toBe("running");
    const replay = vi.spyOn(git, "integrate");
    expect(await recovery.reconcile("run")).toEqual({ ready: true });
    expect(repo.load("run")!.lastAcceptedCommit).toBe(head);
    expect(repo.load("run")!.tasks.A.integration).toMatchObject({ status: "succeeded", acceptedCommit: head });
    expect(repo.load("run")!.integrationQueue).toEqual([]);
    const integration = new IntegrationCoordinator(repo, git); integration.acquire("run");
    await integration.drain("run"); integration.release("run");
    await recovery.reconcile("run");
    expect(replay).not.toHaveBeenCalled();
    expect(repo.load("run")!.operations!.filter(op => op.kind === "integration")).toHaveLength(1);
  });

  it("recovers a caught integration state-save failure without rewriting its diagnostic operation", async () => {
    committed(); await recovery.reconcile("run");
    const coordinator = new IntegrationCoordinator(repo, git); coordinator.acquire("run");
    const update = repo.updateTask.bind(repo);
    let fault = true;
    const save = vi.spyOn(repo, "updateTask").mockImplementation((intent, id, transition) => update(intent, id, (task, state) => {
      transition(task, state);
      if (fault && task.integration?.status === "succeeded") { fault = false; throw new Error("acceptance save interrupted"); }
    }));
    await coordinator.drain("run"); coordinator.release("run"); save.mockRestore();
    const failed = repo.load("run")!.operations!.find(op => op.kind === "integration")!;
    expect(failed.status).toBe("failed");
    const head = git.getRepositoryInfo(integrationPath).head;
    expect(await recovery.reconcile("run")).toEqual({ ready: true });
    expect(repo.load("run")!.lastAcceptedCommit).toBe(head);
    expect(repo.load("run")!.operations!.find(op => op.id === failed.id)).toEqual(failed);
    const accepted = repo.load("run")!.tasks.A.integration!.operationId;
    expect(accepted).not.toBe(failed.id);
    await recovery.reconcile("run");
    expect(repo.load("run")!.operations!.filter(op => op.kind === "integration")).toHaveLength(2);
  });

  it("recovers completed preparation and retains the reserved creation identity", async () => {
    const op = operation("worktree", taskPath, "A"); op.expectedAfter.headCommit = base;
    repo.recordOperationIntent("run", op);
    repo.updateTask("run", "A", task => { task.stage = "preparation"; task.stages!.preparation = { status: "running" }; });
    const record = { ...processRecord(), command: "npm ci", kind: "preparation" as const,
      status: "exited" as const, exitCode: 0, endedAt: new Date().toISOString() };
    repo.recordProcess("run", record);
    expect(await recovery.reconcile("run")).toEqual({ ready: true });
    expect(repo.load("run")!.tasks.A.worktreePath).toBe(taskPath);
    expect(repo.load("run")!.tasks.A.stages!.preparation!.status).toBe("succeeded");
    expect(repo.load("run")!.operations![0].status).toBe("succeeded");
  });

  it.each(["active", "unknown"] as const)("blocks reuse for %s previous process evidence without changing ownership", async status => {
    repo.recordProcess("run", processRecord());
    repo.update("run", state => { state.integrationOwner = { pid: 12345, host: os.hostname(), token: "owner", startedAt: state.updatedAt }; });
    const before = repo.load("run");
    vi.spyOn(processes, "inspect").mockResolvedValue({ status, safeToReuse: false, processes: [], diagnostics: [] });
    expect((await recovery.reconcile("run")).ready).toBe(false);
    expect(repo.load("run")).toEqual(before);
  });

  it("inspects exited parents for live subprocesses", async () => {
    repo.recordProcess("run", { ...processRecord(), status: "exited", exitCode: 0 });
    vi.spyOn(processes, "inspect").mockResolvedValue({ status: "active", safeToReuse: false,
      processes: [{ pid: 999, parentPid: 12345, birth: "birth" }], diagnostics: [] });
    expect((await recovery.reconcile("run")).ready).toBe(false);
    expect(repo.load("run")!.tasks.A.status).toBe("running");
  });

  it("makes an absent agent resumable and reconciles stale exclusive ownership", async () => {
    repo.recordProcess("run", processRecord());
    repo.update("run", state => { state.integrationOwner = { pid: 12345, host: os.hostname(), token: "owner", startedAt: state.updatedAt }; });
    vi.spyOn(processes, "inspect").mockResolvedValue({ status: "interrupted", safeToReuse: true, processes: [], diagnostics: [] });
    expect(await recovery.reconcile("run")).toEqual({ ready: true });
    expect(repo.load("run")!.tasks.A.status).toBe("pending");
    expect(repo.load("run")!.processes![0].status).toBe("interrupted");
    const coordinator = new IntegrationCoordinator(repo, git); coordinator.acquire("run"); coordinator.release("run");
  });

  it("retains live orchestrator ownership even with absent agents", async () => {
    repo.update("run", state => { state.integrationOwner = { pid: process.pid, host: os.hostname(), token: "live", startedAt: state.updatedAt }; });
    const conservative = new ExecutionRecoveryCoordinator(repo, git, processes);
    expect((await conservative.reconcile("run")).ready).toBe(false);
    expect(repo.load("run")!.integrationOwner!.token).toBe("live");
  });

  it("preserves conflict files, attempt budgets, and the last accepted reference", async () => {
    const result = committed(); await recovery.reconcile("run");
    writeFileSync(path.join(integrationPath, "shared.txt"), "accepted\n");
    git.stageAll(integrationPath); const accepted = git.commit(integrationPath, "accepted independent work");
    writeFileSync(path.join(taskPath, "shared.txt"), "incoming\n"); git.stageAll(taskPath); const incoming = git.commit(taskPath, "incoming");
    repo.updateTask("run", "A", (task, state) => { task.resultCommit = incoming; state.lastAcceptedCommit = accepted; });
    const op = operation("integration", integrationPath, "A"); op.source = { ...identity(taskPath), headCommit: incoming };
    repo.recordOperationIntent("run", op); git.integrate(integrationPath, incoming);
    const file = readFileSync(path.join(integrationPath, "shared.txt"), "utf8");
    repo.updateTask("run", "A", task => { task.integration = { status: "running", resultCommit: incoming, resolution: {
      id: op.id, incomingCommit: incoming, lastAcceptedCommit: accepted, worktreePath: integrationPath,
      attempts: 2, status: "running", conflicts: ["shared.txt"], diagnostics: ["gate failed"], promptPaths: ["failed-prompt"] } }; });
    expect(await recovery.reconcile("run")).toEqual({ ready: true });
    expect(repo.load("run")!.lastAcceptedCommit).toBe(accepted);
    expect(repo.load("run")!.tasks.A.integration!.resolution).toMatchObject({ attempts: 2, status: "exhausted", promptPaths: ["failed-prompt"] });
    expect(readFileSync(path.join(integrationPath, "shared.txt"), "utf8")).toBe(file);
    expect(result).not.toBe(incoming);
  });

  it("recovers delivery and cleanup side effects while retaining delivered commits", async () => {
    const head = await merged(); await recovery.reconcile("run");
    repo.update("run", state => { state.tasks.B = { ...state.tasks.A, dependencies: ["A"] }; });
    const delivery = operation("delivery", directory); delivery.source = identity(integrationPath);
    delivery.expectedAfter.headCommit = head;
    repo.recordOperationIntent("run", delivery);
    expect(git.updateOriginalBranch(directory, "main", base, head)).toBe(true);
    expect(await recovery.reconcile("run")).toEqual({ ready: true });
    expect(repo.load("run")!.delivery).toMatchObject({ status: "succeeded", deliveredCommit: head });
    const cleanup = operation("cleanup", taskPath, "A"); cleanup.expectedAfter = { ...cleanup.before, exists: false };
    repo.recordOperationIntent("run", cleanup);
    command(directory, "worktree", "remove", taskPath);
    expect(await recovery.reconcile("run")).toEqual({ ready: true });
    expect(repo.load("run")!.tasks.A.cleanup!.status).toBe("succeeded");
    expect(repo.load("run")!.delivery!.deliveredCommit).toBe(head);
    expect(git.isAncestor(directory, cleanup.before.headCommit!, "refs/heads/" + cleanup.before.branch)).toBe(true);
  });

  it("blocks ambiguous commits and preserves dirty files instead of repairing them", async () => {
    committed(); writeFileSync(path.join(taskPath, "unsaved.txt"), "keep me");
    expect((await recovery.reconcile("run")).ready).toBe(false);
    expect(repo.load("run")!.lastAcceptedCommit).toBe(base);
    expect(readFileSync(path.join(taskPath, "unsaved.txt"), "utf8")).toBe("keep me");
  });

  it("preserves an ambiguous Git command lock and blocks resumed scheduling", async () => {
    const lock = path.join(git.getRepositoryInfo(directory).commonDirectory, "codeforge-integration.lock");
    writeFileSync(lock, "");
    expect((await recovery.reconcile("run")).ready).toBe(false);
    expect(readFileSync(lock, "utf8")).toBe("");
    expect(repo.load("run")!.lastAcceptedCommit).toBe(base);
  });

  it("refuses to overwrite a process launched during inspection", async () => {
    repo.recordProcess("run", processRecord());
    vi.spyOn(processes, "inspect").mockImplementation(async () => {
      repo.updateTask("run", "A", task => { task.attempt = 2; });
      return { status: "interrupted", safeToReuse: true, processes: [], diagnostics: [] };
    });
    await expect(recovery.reconcile("run")).rejects.toThrow("changed during startup recovery");
    expect(repo.load("run")!.tasks.A.attempt).toBe(2);
    expect(repo.load("run")!.tasks.A.status).toBe("running");
  });
});
