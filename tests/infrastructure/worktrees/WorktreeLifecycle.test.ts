import { ExecutionRecoveryCoordinator } from "../../../src/scheduler/ExecutionRecoveryCoordinator.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorktreeLifecycle } from "../../../src/infrastructure/worktrees/WorktreeLifecycle.js";
import { NodeGitGateway } from "../../../src/infrastructure/git/NodeGitGateway.js";
import { NodeWorkspaceGateway } from "../../../src/infrastructure/workspace.js";
import { ExecutionStateRepository } from "../../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { FakeProcessExecutor } from "../../helpers/fake-process-executor.js";
import { TaskBuilder } from "../../helpers/task-builder.js";
import { TaskScheduler } from "../../../src/scheduler/TaskScheduler.js";
import { PromptService } from "../../../src/application/services/PromptService.js";
import { NodeProcessExecutor } from "../../../src/infrastructure/process/NodeProcessExecutor.js";

let directory: string;
let git: NodeGitGateway;
let repo: ExecutionStateRepository;
let executor: FakeProcessExecutor;
let lifecycle: WorktreeLifecycle;
const task = TaskBuilder.aTask().withId("TASK-001").build();
const runGit = (...args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "codeforge preparation "));
  runGit("init", "-b", "main");
  runGit("config", "user.email", "test@example.com");
  runGit("config", "user.name", "Test");
  writeFileSync(path.join(directory, ".gitignore"), ".codeforge/\nnode_modules/\n.env\n");
  writeFileSync(path.join(directory, "package.json"), '{"name":"fixture","version":"1.0.0"}');
  writeFileSync(path.join(directory, "package-lock.json"), '{"name":"fixture","version":"1.0.0","lockfileVersion":3,"packages":{"":{"name":"fixture","version":"1.0.0"}}}');
  runGit("add", ".");
  runGit("commit", "-m", "initial");
  git = new NodeGitGateway(directory);
  repo = new ExecutionStateRepository(new NodeWorkspaceGateway(directory));
  executor = new FakeProcessExecutor();
  lifecycle = new WorktreeLifecycle(git, executor, repo);
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("WorktreeLifecycle", () => {
  it.each(["staged", "unstaged", "untracked", "detached", "unborn", "missing"])("blocks %s before recording state or creating Git artifacts", async condition => {
    if (condition === "staged" || condition === "unstaged") {
      writeFileSync(path.join(directory, "package.json"), "changed");
      if (condition === "staged") runGit("add", "package.json");
    }
    if (condition === "untracked") writeFileSync(path.join(directory, "new.txt"), "local");
    if (condition === "detached") runGit("checkout", "--detach");
    if (condition === "unborn") runGit("checkout", "--orphan", "unborn");
    if (condition === "missing") rmSync(path.join(directory, ".git"), { recursive: true, force: true });
    const mutate = vi.spyOn(executor, "exec");
    await expect(lifecycle.initializeRun("intent", [task], directory)).rejects.toThrow();
    expect(repo.load("intent")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
    if (condition !== "missing") expect(runGit("for-each-ref", "refs/heads/codex/")).toBe("");
  });

  it("blocks an unavailable Git executable before persisting a run", async () => {
    vi.spyOn(git, "hasRepository").mockImplementation(() => { throw new Error("spawn git ENOENT"); });
    await expect(lifecycle.initializeRun("intent", [task], directory)).rejects.toThrow("git ENOENT");
    expect(repo.load("intent")).toBeNull();
    expect(executor.execCalls).toHaveLength(0);
    expect(runGit("for-each-ref", "refs/heads/codex/")).toBe("");
  });

  it("preserves a failed integration installation and reuses its identity", async () => {
    executor.setDefaultResponse({ exitCode: 1, stderr: "integration install failed" });
    await expect(lifecycle.initializeRun("intent", [task], directory)).rejects.toThrow("integration install failed");
    const failed = repo.load("intent")!;
    expect(failed.status).toBe("paused");
    expect(failed.diagnostics!.at(-1)!.message).toContain("integration install failed");
    expect(failed.tasks[task.id].status).toBe("pending");
    expect(failed.operations![0].status).toBe("failed");
    executor.setDefaultResponse({ exitCode: 0 });
    const recovered = await lifecycle.initializeRun("intent", [task], directory);
    expect(recovered.integrationBranch).toBe(failed.integrationBranch);
    expect(recovered.integrationWorktreePath).toBe(failed.integrationWorktreePath);
    expect(recovered.operations!.at(-1)!.before.exists).toBe(true);
    expect(git.listWorktrees(directory)).toHaveLength(2);
  });

  it("records the original identity and prepares distinct integration and task installations without copying ignored files", async () => {
    writeFileSync(path.join(directory, ".env"), "SECRET=local");
    executor.setDefaultHandler((_command, _args, options) => {
      mkdirSync(path.join(options!.cwd!, "node_modules"), { recursive: true });
      writeFileSync(path.join(options!.cwd!, "node_modules", "owner"), options!.cwd!);
      return { exitCode: 0, stdout: "installed", stderr: "" };
    });
    const second = TaskBuilder.aTask().withId("TASK-002").build();
    const state = await lifecycle.initializeRun("intent", [task, second], directory);
    const base = lifecycle.getIntegrationCommit("intent");
    const [a, b] = await Promise.all([lifecycle.prepareTask("intent", task.id, base), lifecycle.prepareTask("intent", second.id, base)]);
    expect(new Set([a.directory, b.directory, state.integrationWorktreePath]).size).toBe(3);
    expect(new Set([a.branch, b.branch, state.integrationBranch]).size).toBe(3);
    expect(state.originalBranch).toBe("main");
    expect(state.originalCommit).toBe(runGit("rev-parse", "HEAD"));
    expect(executor.execCalls.map(call => call.command)).toEqual(["npm ci", "npm ci", "npm ci"]);
    for (const cwd of [a.directory, b.directory, state.integrationWorktreePath!]) {
      expect(existsSync(path.join(cwd, ".env"))).toBe(false);
      expect(readFileSync(path.join(cwd, "node_modules", "owner"), "utf8")).toBe(cwd);
    }
    expect(repo.load("intent")!.tasks[task.id].baseCommit).toBe(base);
    expect(repo.load("intent")!.tasks[task.id].stages!.preparation!.status).toBe("succeeded");
  });

  it("uses an explicitly supplied fixed integration commit", async () => {
    const state = await lifecycle.initializeRun("intent", [task], directory);
    writeFileSync(path.join(state.integrationWorktreePath!, "result.txt"), "integrated");
    git.stageAll(state.integrationWorktreePath!);
    const base = git.commit(state.integrationWorktreePath!, "integration result");
    repo.update("intent", current => { current.lastAcceptedCommit = base; });
    const owned = await lifecycle.prepareTask("intent", task.id, base);
    expect(git.getRepositoryInfo(owned.directory).head).toBe(base);
    expect(readFileSync(path.join(owned.directory, "result.txt"), "utf8")).toBe("integrated");
    await expect(lifecycle.prepareTask("intent", task.id, "main")).resolves.toEqual(owned);
    expect(repo.load("intent")!.tasks[task.id].baseCommit).toBe(base);
  });

  it("retains installation failure diagnostics and retries the same task artifacts", async () => {
    await lifecycle.initializeRun("intent", [task], directory);
    executor.setDefaultResponse({ exitCode: 1, stdout: "npm output", stderr: "lockfile mismatch" });
    await expect(lifecycle.prepareTask("intent", task.id, lifecycle.getIntegrationCommit("intent"))).rejects.toThrow("lockfile mismatch");
    const failed = repo.load("intent")!.tasks[task.id];
    expect(failed.status).toBe("failed");
    expect(failed.diagnostics!.at(-1)!.message).toContain("npm output");
    writeFileSync(path.join(failed.worktreePath!, "keep.txt"), "recover me");
    executor.setDefaultResponse({ exitCode: 0 });
    const owned = await lifecycle.prepareTask("intent", task.id, failed.baseCommit!);
    expect(owned.directory).toBe(failed.worktreePath);
    expect(readFileSync(path.join(owned.directory, "keep.txt"), "utf8")).toBe("recover me");
    expect(git.listWorktrees(directory)).toHaveLength(3);
    await lifecycle.prepareTask("intent", task.id, failed.baseCommit!);
    expect(executor.execCalls).toHaveLength(3);
  });

  it("reconciles a worktree created before its operation outcome was persisted", async () => {
    const outcome = vi.spyOn(repo, "recordOperationOutcome").mockImplementation(() => { throw new Error("interrupted persistence"); });
    await expect(lifecycle.initializeRun("intent", [task], directory)).rejects.toThrow("interrupted persistence");
    const partial = repo.load("intent")!;
    expect(partial.operations![0].status).toBe("intended");
    outcome.mockRestore();
    const recovered = await lifecycle.initializeRun("intent", [task], directory);
    expect(recovered.integrationWorktreePath).toBe(partial.integrationWorktreePath);
    expect(git.listWorktrees(directory)).toHaveLength(2);
    expect(recovered.operations![0].status).toBe("succeeded");
  });

  it("reuses a partially created branch after worktree creation failed", async () => {
    const originalList = git.listWorktrees.bind(git);
    vi.spyOn(git, "listWorktrees").mockImplementationOnce(() => []).mockImplementationOnce(() => { throw new Error("inspection failed"); });
    await expect(lifecycle.initializeRun("intent", [task], directory)).rejects.toThrow("inspection failed");
    const partial = repo.load("intent")!;
    // Simulate only the branch surviving an interrupted add.
    runGit("worktree", "remove", partial.integrationWorktreePath!);
    vi.spyOn(git, "listWorktrees").mockImplementation(originalList);
    await lifecycle.initializeRun("intent", [task], directory);
    expect(repo.load("intent")!.integrationBranch).toBe(partial.integrationBranch);
    expect(git.listWorktrees(directory)).toHaveLength(2);
  });

  it("reports changed ownership without creating a duplicate", async () => {
    const state = await lifecycle.initializeRun("intent", [task], directory);
    execFileSync("git", ["checkout", "--detach"], { cwd: state.integrationWorktreePath, stdio: "ignore" });
    await expect(lifecycle.prepareIntegration("intent")).rejects.toThrow("identity changed");
    expect(git.listWorktrees(directory)).toHaveLength(2);
    expect(executor.execCalls).toHaveLength(1);
  });

  it("does not reuse an environment with active preparation processes", async () => {
    await lifecycle.initializeRun("intent", [task], directory);
    executor.inspection = { status: "active", safeToReuse: false, processes: [], diagnostics: ["npm still running"] };
    await expect(lifecycle.prepareIntegration("intent")).rejects.toThrow("occupancy");
    expect(executor.execCalls).toHaveLength(1);
  });

  it("runs parallel agents and gates with separate real npm installations", async () => {
    mkdirSync(path.join(directory, "deps", "fixture-dep"), { recursive: true });
    writeFileSync(path.join(directory, "deps", "fixture-dep", "package.json"), '{"name":"fixture-dep","version":"1.0.0"}');
    writeFileSync(path.join(directory, "package.json"), '{"name":"fixture","version":"1.0.0","dependencies":{"fixture-dep":"file:deps/fixture-dep"}}');
    writeFileSync(path.join(directory, "package-lock.json"), JSON.stringify({
      name: "fixture", version: "1.0.0", lockfileVersion: 3, packages: {
        "": { name: "fixture", version: "1.0.0", dependencies: { "fixture-dep": "file:deps/fixture-dep" } },
        "deps/fixture-dep": { name: "fixture-dep", version: "1.0.0" },
        "node_modules/fixture-dep": { resolved: "deps/fixture-dep", link: true },
      },
    }));
    runGit("add", "."); runGit("commit", "-m", "local dependency");
    const gw = new NodeWorkspaceGateway(directory);
    const second = TaskBuilder.aTask().withId("TASK-002").build();
    gw.mkdir(".codeforge/tasks/intent");
    for (const item of [task, second]) gw.writeFile(".codeforge/tasks/intent/" + item.id + ".json", JSON.stringify(item));
    // CIM process enumeration is unavailable in restricted Windows test environments.
    // Keep Git and npm real while supplying the independent occupancy boundary.
    vi.spyOn(repo, "inspectEnvironment").mockResolvedValue({
      status: "interrupted", safeToReuse: true, processes: [], diagnostics: [],
    });
    const contexts: Array<{ cwd: string; taskId?: string }> = [];
    const runner = { execute: vi.fn(async (context: { cwd: string; taskId?: string }) => {
      expect(existsSync(path.join(context.cwd, "node_modules", "fixture-dep", "package.json"))).toBe(true);
      contexts.push(context);
      writeFileSync(path.join(context.cwd, "node_modules", "task-owner"), context.taskId!);
    }) };
    const hooks = { dispatch: vi.fn(async (context: { event: string; cwd: string; taskId?: string }) => {
      if (context.event === "task.verify") {
        expect(readFileSync(path.join(context.cwd, "node_modules", "task-owner"), "utf8")).toBe(context.taskId);
      }
      return [];
    }) };
    const scheduler = new TaskScheduler({ cwd: directory, gw, runner, hooks,
      cleanupCoordinator: { cleanup: async () => ({ failures: [] }) },
      config: { environment: "test", plannerAgent: "p", executorAgent: "e", language: "en" },
      stateRepo: repo, promptService: new PromptService(gw) });
    const result = await scheduler.run("intent", { skipReview: true });
    expect(result.status, JSON.stringify(repo.load("intent")!.tasks)).toBe("completed");
    expect(new Set(contexts.map(context => context.cwd)).size).toBe(2);
    const state = repo.load("intent")!;
    expect(existsSync(path.join(state.integrationWorktreePath!, "node_modules", "fixture-dep", "package.json"))).toBe(true);
    expect(existsSync(path.join(directory, "node_modules"))).toBe(false);
    expect(state.processes!.filter(record => record.kind === "preparation" && record.exitCode === 0)).toHaveLength(3);
  }, 30000);

  it("prepares integration with real npm ci before returning", async () => {
    const real = new WorktreeLifecycle(git, new NodeProcessExecutor(), repo);
    const state = await real.initializeRun("intent", [task], directory);
    expect(state.processes!.some(record => record.command === "npm ci" && record.exitCode === 0)).toBe(true);
    expect(state.operations![0].status).toBe("succeeded");
  });

  it("starts neither agents nor task hooks when task npm ci fails", async () => {
    await lifecycle.initializeRun("intent", [task], directory);
    executor.setDefaultResponse({ exitCode: 1, stderr: "install failed" });
    const gw = new NodeWorkspaceGateway(directory);
    gw.mkdir(".codeforge/tasks/intent");
    gw.writeFile(".codeforge/tasks/intent/" + task.id + ".json", JSON.stringify(task));
    const runner = { execute: vi.fn() };
    const hooks = { dispatch: vi.fn().mockResolvedValue([]) };
    const scheduler = new TaskScheduler({ cwd: directory, gw, runner,
      config: { environment: "test", plannerAgent: "p", executorAgent: "e", language: "en" },
      stateRepo: repo, promptService: new PromptService(gw), recoveryCoordinator: new ExecutionRecoveryCoordinator(repo, git, executor), worktreeLifecycle: lifecycle, hooks });
    expect((await scheduler.run("intent", { skipReview: true })).status).toBe("failed");
    expect(runner.execute).not.toHaveBeenCalled();
    expect(hooks.dispatch.mock.calls.some(([context]) => context.event.startsWith("task."))).toBe(false);
    expect(repo.load("intent")!.tasks[task.id].diagnostics!.at(-1)!.message).toContain("install failed");
  });
});
