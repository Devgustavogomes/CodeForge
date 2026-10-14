import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CleanupCoordinator } from "../../src/scheduler/CleanupCoordinator.js";
import { TaskScheduler } from "../../src/scheduler/TaskScheduler.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { InMemoryAgentRunner } from "../helpers/in-memory-agent-runner.js";
import { PromptService } from "../../src/application/services/PromptService.js";
import { fakeWorktreeLifecycle, fakeDeliveryGit, fakeTaskResultGit, fakeRecoveryCoordinator } from "../helpers/fake-worktree-lifecycle.js";
import { DeliveryCoordinator } from "../../src/scheduler/DeliveryCoordinator.js";
import { NodeGitGateway } from "../../src/infrastructure/git/NodeGitGateway.js";
import { WorktreeLifecycle } from "../../src/infrastructure/worktrees/WorktreeLifecycle.js";
import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { FakeProcessExecutor } from "../helpers/fake-process-executor.js";
import { TaskBuilder } from "../helpers/task-builder.js";

// Real Git removal verifies both disk behavior and retained refs, with deterministic process inspection.
describe("CleanupCoordinator", { timeout: 60000 }, () => {
  let directory: string;
  let taskPath: string;
  let integrationPath: string;
  let repo: ExecutionStateRepository;
  let git: NodeGitGateway;
  let processes: FakeProcessExecutor;
  let coordinator: CleanupCoordinator;
  const command = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

  beforeEach(async () => {
    directory = mkdtempSync(path.join(os.tmpdir(), "codeforge-cleanup-"));
    command(directory, "init", "-b", "main");
    command(directory, "config", "core.autocrlf", "false");
    command(directory, "config", "user.name", "Test");
    command(directory, "config", "user.email", "test@example.com");
    writeFileSync(path.join(directory, ".gitignore"), ".codeforge/\n");
    writeFileSync(path.join(directory, "file.txt"), "base\n");
    command(directory, "add", ".");
    command(directory, "commit", "-m", "base");
    repo = new ExecutionStateRepository(new NodeWorkspaceGateway(directory));
    git = new NodeGitGateway(directory);
    processes = new FakeProcessExecutor();
    const lifecycle = new WorktreeLifecycle(git, processes, repo);
    const task = TaskBuilder.aTask().withId("A").build();
    await lifecycle.initializeRun("run", [task], directory);
    const owned = await lifecycle.prepareTask("run", "A", lifecycle.getIntegrationCommit("run"));
    taskPath = owned.directory;
    integrationPath = repo.load("run")!.integrationWorktreePath!;
    writeFileSync(path.join(taskPath, "file.txt"), "delivered\n");
    git.stageAll(taskPath);
    const result = git.commit(taskPath, "task result");
    const accepted = git.integrate(integrationPath, result).head;
    repo.update("run", state => {
      state.lastAcceptedCommit = accepted;
      Object.assign(state.tasks.A, { status: "completed", resultCommit: result,
        integration: { status: "succeeded", resultCommit: result, acceptedCommit: accepted } });
    });
    expect(new DeliveryCoordinator(repo, git).deliver("run", true).delivered).toBe(true);
    repo.update("run", state => { state.status = "completed"; });
    coordinator = new CleanupCoordinator(repo, git, processes);
  }, 30000);

  afterEach(() => {
    // All artifacts, including links and Git metadata, belong to this exact temporary fixture.
    rmSync(directory, { recursive: true, force: true });
  });

  it("removes only delivered worktrees, persists progress, and retains all branches and commits", async () => {
    const state = repo.load("run")!;
    const remove = git.removeWorktree.bind(git);
    vi.spyOn(git, "removeWorktree").mockImplementation((...args) => {
      expect(repo.load("run")!.operations!.at(-1)!.kind).toBe("cleanup");
      expect(repo.load("run")!.operations!.at(-1)!.status).toBe("intended");
      remove(...args);
    });
    expect(await coordinator.cleanup("run")).toEqual({ failures: [] });
    expect(existsSync(taskPath)).toBe(false);
    expect(existsSync(integrationPath)).toBe(false);
    expect(git.listWorktrees(directory)).toHaveLength(1);
    expect(command(directory, "rev-parse", state.tasks.A.branch!)).toBe(state.tasks.A.resultCommit);
    expect(command(directory, "rev-parse", state.integrationBranch!)).toBe(state.lastAcceptedCommit);
    expect(command(directory, "show", state.delivery!.deliveredCommit! + ":file.txt")).toBe("delivered");
    expect(repo.load("run")!.cleanup!.map(item => item.status)).toEqual(["succeeded", "succeeded"]);
    expect(repo.load("run")!.tasks.A.cleanup!.status).toBe("succeeded");
    const operations = repo.load("run")!.operations!.length;
    expect(await coordinator.cleanup("run")).toEqual({ failures: [] });
    expect(repo.load("run")!.operations).toHaveLength(operations);
    expect(git.removeWorktree).toHaveBeenCalledTimes(2);
  });

  it.each(["pending", "running", "failed", "blocked"] as const)("does nothing before successful delivery (%s)", async status => {
    repo.update("run", state => { state.delivery!.status = status; });
    const remove = vi.spyOn(git, "removeWorktree");
    expect(await coordinator.cleanup("run")).toEqual({ failures: [] });
    expect(remove).not.toHaveBeenCalled();
    expect(existsSync(taskPath)).toBe(true);
  });

  it.each(["foreign path", "branch", "run", "task", "creation", "delivery evidence", "unincorporated", "pending task", "failed task", "resolution"])("preserves artifacts with %s mismatch", async mismatch => {
    const foreign = path.join(directory, "foreign");
    mkdirSync(foreign);
    writeFileSync(path.join(foreign, "user.txt"), "user data");
    const state = repo.load("run")!;
    {
      if (mismatch === "foreign path") state.tasks.A.worktreePath = foreign;
      if (mismatch === "branch") state.tasks.A.branch = "codex/foreign-A";
      if (mismatch === "run") state.runId = "another-run";
      if (mismatch === "task") state.tasks.B = { ...state.tasks.A }; // B cannot claim A's artifact.
      if (mismatch === "creation") state.operations!.find(op => op.kind === "worktree" && op.taskId === "A")!.runId = "foreign";
      if (mismatch === "delivery evidence") state.delivery!.operationId = "missing";
      if (mismatch === "unincorporated") state.tasks.A.resultCommit = state.originalCommit;
      if (mismatch === "pending task") state.tasks.A.status = "pending";
      if (mismatch === "failed task") state.tasks.A.status = "failed";
      if (mismatch === "resolution") state.tasks.A.integration!.resolution = { id: "conflict", incomingCommit: "x",
        lastAcceptedCommit: "y", worktreePath: integrationPath, attempts: 2, status: "failed", conflicts: [], diagnostics: [] };
    }
    // Simulate corrupt persisted evidence, which normal repository transitions reject.
    writeFileSync(path.join(directory, ".codeforge/executions/run.json"), JSON.stringify(state));
    expect((await coordinator.cleanup("run")).failures.length).toBeGreaterThan(0);
    expect(existsSync(taskPath)).toBe(true);
    expect(existsSync(foreign)).toBe(true);
    expect(repo.load("run")!.delivery!.status).toBe("succeeded");
  });

  it.each(["modified", "staged", "untracked", "conflicted", "unexpected HEAD", "locked"])("preserves %s task work while cleaning the eligible integration", async change => {
    if (change === "modified" || change === "staged") writeFileSync(path.join(taskPath, "file.txt"), "pending work");
    if (change === "staged") command(taskPath, "add", "file.txt");
    if (change === "untracked") writeFileSync(path.join(taskPath, "pending.txt"), "pending work");
    if (change === "conflicted") vi.spyOn(git, "getConflicts").mockImplementation(cwd => cwd === taskPath ? ["file.txt"] : []);
    if (change === "unexpected HEAD") command(taskPath, "commit", "--allow-empty", "-m", "undelivered");
    if (change === "locked") command(directory, "worktree", "lock", taskPath);
    expect((await coordinator.cleanup("run")).failures).toHaveLength(1);
    expect(existsSync(taskPath)).toBe(true);
    expect(existsSync(integrationPath)).toBe(false);
    expect(repo.load("run")!.status).toBe("completed");
    expect(repo.load("run")!.diagnostics!.at(-1)!.stage).toBe("cleanup");
  });

  it.each(["active", "unknown"] as const)("preserves worktrees with %s process occupancy", async status => {
    processes.inspection = { status, safeToReuse: false, processes: [], diagnostics: ["occupied"] };
    const remove = vi.spyOn(git, "removeWorktree");
    expect((await coordinator.cleanup("run")).failures).toHaveLength(2);
    expect(remove).not.toHaveBeenCalled();
    expect(processes.inspections.length).toBeGreaterThan(0);
  });

  it("rechecks occupancy after persisting removal intent", async () => {
    const inspect = processes.inspect.bind(processes);
    vi.spyOn(processes, "inspect").mockImplementation(async record => {
      if (repo.load("run")!.tasks.A.cleanup?.status === "running" && record.cwd === taskPath) {
        return { status: "active", safeToReuse: false, processes: [], diagnostics: ["new child"] };
      }
      return inspect(record);
    });
    expect((await coordinator.cleanup("run")).failures).toHaveLength(1);
    expect(existsSync(taskPath)).toBe(true);
  });

  it("preserves redirected canonical paths", async () => {
    const moved = path.join(directory, "moved-task");
    renameSync(taskPath, moved);
    symlinkSync(moved, taskPath, "junction");
    expect((await coordinator.cleanup("run")).failures).toHaveLength(1);
    expect(existsSync(taskPath)).toBe(true);
    expect(existsSync(moved)).toBe(true);
  });

  it("does not accept missing artifacts without removal evidence", async () => {
    command(directory, "worktree", "remove", taskPath);
    expect((await coordinator.cleanup("run")).failures).toHaveLength(1);
    expect(repo.load("run")!.tasks.A.cleanup!.status).toBe("blocked");
    expect(repo.load("run")!.tasks.A.cleanup!.operationId).toBeUndefined();
  });

  it.each(["before", "after"])("recovers a removal failure %s the Git mutation without changing delivery", async when => {
    const remove = git.removeWorktree.bind(git);
    vi.spyOn(git, "removeWorktree").mockImplementationOnce((...args) => {
      if (when === "after") remove(...args);
      throw new Error("interrupted removal");
    });
    expect((await coordinator.cleanup("run")).failures).toHaveLength(1);
    expect(repo.load("run")!.status).toBe("completed");
    expect(repo.load("run")!.delivery!.status).toBe("succeeded");
    expect(repo.load("run")!.tasks.A.cleanup!.status).toBe("blocked");
    expect(await coordinator.cleanup("run")).toEqual({ failures: [] });
    expect(repo.load("run")!.tasks.A.cleanup!.status).toBe("succeeded");
    expect(existsSync(taskPath)).toBe(false);
  });

  it("never removes an unrelated directory recreated at a previously cleaned path", async () => {
    expect(await coordinator.cleanup("run")).toEqual({ failures: [] });
    mkdirSync(taskPath);
    writeFileSync(path.join(taskPath, "foreign.txt"), "unrelated work");
    const remove = vi.spyOn(git, "removeWorktree");
    expect((await coordinator.cleanup("run")).failures).toHaveLength(1);
    expect(remove).not.toHaveBeenCalled();
    expect(existsSync(path.join(taskPath, "foreign.txt"))).toBe(true);
  });
});


describe("scheduler cleanup delivery boundary", () => {
  it.each(["reported failure", "exception"])("retains completion after a cleanup %s and retries without redelivery", async failure => {
    const gw = new InMemoryWorkspaceGateway();
    const repo = new ExecutionStateRepository(gw);
    const task = TaskBuilder.aTask().build();
    gw.mkdir(".codeforge/tasks/run");
    gw.writeFile(".codeforge/tasks/run/" + task.id + ".json", JSON.stringify(task));
    const runner = new InMemoryAgentRunner();
    const deliveryGit = fakeDeliveryGit(repo, "run");
    const deliver = vi.spyOn(deliveryGit, "updateOriginalBranch");
    const cleanup = vi.fn(async () => {
      expect(repo.load("run")!.status).toBe("completed");
      expect(repo.load("run")!.delivery!.status).toBe("succeeded");
      if (failure === "exception") throw new Error("cleanup unavailable");
      return { failures: ["worktree locked"] };
    });
    const reporter = { onStart: vi.fn(), onComplete: vi.fn(), onFail: vi.fn(), onUpdate: vi.fn(),
      onError: vi.fn(), onWarning: vi.fn(), onDeadlock: vi.fn(), onLog: vi.fn() };
    const scheduler = new TaskScheduler({ gw, runner, stateRepo: repo, promptService: new PromptService(gw), reporter,
      config: { environment: "test", plannerAgent: "test", executorAgent: "test", language: "en" },
      recoveryCoordinator: fakeRecoveryCoordinator(repo), worktreeLifecycle: fakeWorktreeLifecycle(repo), taskResultGit: fakeTaskResultGit(),
      integrationGit: fakeTaskResultGit(), deliveryGit, cleanupCoordinator: { cleanup } });
    expect((await scheduler.run("run")).status).toBe("completed");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(reporter.onWarning).toHaveBeenCalledOnce();
    expect(reporter.onError).not.toHaveBeenCalled();
    expect(repo.load("run")!.delivery!.status).toBe("succeeded");
    if (failure === "exception") expect(repo.load("run")!.diagnostics!.at(-1)!.stage).toBe("cleanup");
    const launches = runner.executedContexts.length;
    cleanup.mockImplementation(async () => ({ failures: [] }));
    expect((await scheduler.run("run")).status).toBe("completed");
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenCalledOnce();
    expect(runner.executedContexts).toHaveLength(launches);
  });

  it("does not invoke cleanup while delivery is pending", async () => {
    const gw = new InMemoryWorkspaceGateway();
    const repo = new ExecutionStateRepository(gw);
    const task = TaskBuilder.aTask().build();
    gw.mkdir(".codeforge/tasks/run");
    gw.writeFile(".codeforge/tasks/run/" + task.id + ".json", JSON.stringify(task));
    const deliveryGit = fakeDeliveryGit(repo, "run");
    vi.spyOn(deliveryGit, "updateOriginalBranch").mockReturnValue(false);
    const cleanup = vi.fn(async () => ({ failures: [] }));
    const scheduler = new TaskScheduler({ gw, runner: new InMemoryAgentRunner(), stateRepo: repo,
      promptService: new PromptService(gw),
      config: { environment: "test", plannerAgent: "test", executorAgent: "test", language: "en" },
      recoveryCoordinator: fakeRecoveryCoordinator(repo), worktreeLifecycle: fakeWorktreeLifecycle(repo), taskResultGit: fakeTaskResultGit(),
      integrationGit: fakeTaskResultGit(), deliveryGit, cleanupCoordinator: { cleanup } });
    expect((await scheduler.run("run")).status).toBe("paused");
    expect(cleanup).not.toHaveBeenCalled();
  });
});
