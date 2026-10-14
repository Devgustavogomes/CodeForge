import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskExecutor } from "../../src/scheduler/TaskExecutor.js";
import { DAGResolver } from "../../src/scheduler/DAGResolver.js";
import { NodeGitGateway } from "../../src/infrastructure/git/NodeGitGateway.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../src/application/services/PromptService.js";
import { HookContext } from "../../src/domain/hook.js";
import { Task } from "../../src/domain/task.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";

const task: Task = { id: "TASK-001", title: "Task", objective: "O", context: "C", implementation: "I",
  files: [], dependencies: [], constraints: [], acceptanceCriteria: [] };
const config = { environment: "test", plannerAgent: "p", executorAgent: "e", language: "en" };

describe("TaskExecutor committed results", () => {
  let checkout: string;
  let cwd: string;
  let repository: ExecutionStateRepository;
  let prompts: PromptService;
  let git: NodeGitGateway;
  let runner: { execute: ReturnType<typeof vi.fn> };
  let hooks: { dispatch: ReturnType<typeof vi.fn> };
  const command = (directory: string, ...args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  const record = () => repository.load("intent")!.tasks[task.id];
  const execute = () => new TaskExecutor(runner, config, repository, prompts, checkout, git)
    .executeTask("intent", task, { cwd, hooks });

  beforeEach(() => {
    checkout = mkdtempSync(path.join(os.tmpdir(), "codeforge-executor-"));
    command(checkout, "init");
    command(checkout, "config", "user.name", "Tests");
    command(checkout, "config", "user.email", "tests@example.com");
    writeFileSync(path.join(checkout, "tracked.txt"), "base");
    command(checkout, "add", "--all");
    command(checkout, "commit", "-m", "base");
    git = new NodeGitGateway(checkout);
    const owned = git.createWorktree(checkout, "run", task.id, command(checkout, "rev-parse", "HEAD"));
    cwd = owned.directory;
    const workspace = new InMemoryWorkspaceGateway();
    repository = new ExecutionStateRepository(workspace);
    prompts = new PromptService(workspace);
    repository.save(repository.init("intent", [task, { ...task, id: "TASK-002", dependencies: [task.id] }]));
    repository.updateTask("intent", task.id, (record, state) => {
      state.repositoryPath = checkout; state.originalWorktreePath = checkout;
      Object.assign(record, { branch: owned.branch, baseCommit: owned.baseCommit, worktreePath: cwd,
        stages: { preparation: { status: "succeeded" } } });
    });
    runner = { execute: vi.fn(async () => {
      writeFileSync(path.join(cwd, "tracked.txt"), "modified");
      writeFileSync(path.join(cwd, "added.txt"), "new");
    }) };
    hooks = { dispatch: vi.fn(async (_context: HookContext) => []) };
  });

  afterEach(() => rmSync(checkout, { recursive: true, force: true }));

  it("commits added and modified files before notification and leaves dependents blocked", async () => {
    hooks.dispatch.mockImplementation(async (context: HookContext) => {
      expect(context.cwd).toBe(cwd);
      expect(context.onProcessRecord).toBeTypeOf("function");
      if (context.event === "task.completed") {
        expect(record().status).toBe("completed");
        expect(record().integration?.status).toBe("pending");
        expect(command(cwd, "show", record().resultCommit + ":added.txt")).toBe("new");
      }
      return [];
    });
    await execute();
    expect(runner.execute).toHaveBeenCalledWith(expect.objectContaining({ cwd, onProcessRecord: expect.any(Function) }));
    expect(command(cwd, "show", record().resultCommit + ":tracked.txt")).toBe("modified");
    expect(command(checkout, "show", "HEAD:tracked.txt")).toBe("base");
    expect(new DAGResolver().getReadyTasks(repository.load("intent")!)).not.toContain("TASK-002");
    expect(record().stages?.commit?.status).toBe("succeeded");
  });

  it("records an explicit no-change outcome with HEAD as the approved result", async () => {
    runner.execute.mockResolvedValue(undefined);
    const before = command(cwd, "rev-parse", "HEAD");
    await execute();
    expect(record().status).toBe("completed");
    expect(record().resultCommit).toBe(before);
    const operation = repository.load("intent")!.operations!.at(-1)!;
    expect(operation.status).toBe("succeeded");
    expect(operation.outcome?.diagnostics?.[0]).toContain("no-change");
    expect(operation.before.headCommit).toBe(operation.outcome?.after.headCommit);
  });

  it.each(["agent", "started hook", "verification", "prompt", "commit"])("preserves work and diagnostics after %s failure", async failure => {
    writeFileSync(path.join(cwd, "retained.txt"), "retain");
    if (failure === "agent") runner.execute.mockRejectedValue(new Error("agent failure"));
    if (failure === "prompt") vi.spyOn(prompts, "createPromptFile").mockImplementation(() => { throw new Error("prompt failure"); });
    if (failure === "commit") vi.spyOn(git, "commit").mockImplementation(() => { throw new Error("commit failure"); });
    if (failure === "started hook" || failure === "verification") hooks.dispatch.mockImplementation(async (context: HookContext) => {
      if (context.event === (failure === "started hook" ? "task.started" : "task.verify")) throw new Error(failure + " failure");
      return [];
    });
    await execute();
    expect(record().status).toBe("failed");
    expect(record().errors?.join(" ")).toContain(failure + " failure");
    expect(record().resultCommit).toBeUndefined();
    expect(readFileSync(path.join(cwd, "retained.txt"), "utf8")).toBe("retain");
    expect(hooks.dispatch.mock.calls.some(([context]) => context.event === "task.completed")).toBe(false);
  });

  it("records preparation failure without starting an agent or hook", async () => {
    await new TaskExecutor(runner, config, repository, prompts, checkout, git).executeTask("intent", task,
      { cwd: checkout, hooks, prepareWorktree: async () => { throw new Error("npm ci failed"); } });
    expect(record().status).toBe("failed");
    expect(record().diagnostics?.at(-1)?.stage).toBe("preparation");
    expect(runner.execute).not.toHaveBeenCalled();
    expect(hooks.dispatch).not.toHaveBeenCalled();
  });

  it("retries a failed commit in the same worktree and retains prior diagnostics", async () => {
    const commit = git.commit.bind(git);
    const spy = vi.spyOn(git, "commit").mockImplementationOnce(() => { throw new Error("commit unavailable"); }).mockImplementation(commit);
    await execute();
    expect(record().status).toBe("failed");
    expect(repository.load("intent")!.operations!.at(-1)?.status).toBe("failed");
    await execute();
    expect(record().status).toBe("completed");
    expect(record().attempt).toBe(2);
    expect(record().worktreePath).toBe(cwd);
    expect(record().diagnostics?.some(item => item.message === "commit unavailable")).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("resumes interrupted verification without rerunning an approved agent", async () => {
    writeFileSync(path.join(cwd, "retained.txt"), "agent result");
    repository.updateTask("intent", task.id, record => {
      record.status = "pending"; record.stage = "verification"; record.attempt = 1;
      record.stages!.execution = { status: "succeeded" };
      record.stages!.verification = { status: "pending" };
    });
    await execute();
    expect(record().status).toBe("completed");
    expect(record().attempt).toBe(1);
    expect(runner.execute).not.toHaveBeenCalled();
    expect(hooks.dispatch.mock.calls.filter(([context]) => context.event === "task.verify")).toHaveLength(1);
    expect(command(cwd, "show", record().resultCommit + ":retained.txt")).toBe("agent result");
  });

  it("refuses the original checkout before starting hooks or agents", async () => {
    repository.updateTask("intent", task.id, record => { record.worktreePath = checkout; });
    await new TaskExecutor(runner, config, repository, prompts, checkout, git)
      .executeTask("intent", task, { cwd: checkout, hooks });
    expect(record().status).toBe("failed");
    expect(runner.execute).not.toHaveBeenCalled();
    expect(hooks.dispatch).not.toHaveBeenCalled();
  });

  it("rejects a gate veto without recording an approved commit", async () => {
    hooks.dispatch.mockImplementation(async (context: HookContext) => context.event === "task.verify" ?
      [{ name: "lint", type: "gate", ok: false, exitCode: 1, output: "lint failed" }] : []);
    await execute();
    expect(record().status).toBe("failed");
    expect(record().stage).toBe("verification");
    expect(repository.load("intent")!.operations ?? []).toEqual([]);
    expect(git.getStatus(cwd).some(entry => entry.path === "added.txt")).toBe(true);
  });

  it.each(["changed", "no-change"])("recovers %s result evidence before completion could be persisted", async mode => {
    if (mode === "no-change") runner.execute.mockResolvedValue(undefined);
    const update = repository.updateTask.bind(repository);
    let interrupt = true;
    vi.spyOn(repository, "updateTask").mockImplementation((intent, id, transition) => update(intent, id, (task, state) => {
      transition(task, state);
      if (interrupt && task.status === "completed") { interrupt = false; throw new Error("state write interrupted"); }
    }));
    await execute();
    expect(record().status).toBe("failed");
    const result = command(cwd, "rev-parse", "HEAD");
    await execute();
    expect(record().status).toBe("completed");
    expect(record().resultCommit).toBe(result);
    expect(runner.execute).toHaveBeenCalledTimes(1);
    expect(record().attempt).toBe(1);
  });

  it("rejects a started gate veto before running the agent", async () => {
    hooks.dispatch.mockImplementation(async (context: HookContext) => context.event === "task.started" ?
      [{ name: "start", type: "gate", ok: false, exitCode: 1, output: "start veto" }] : []);
    await execute();
    expect(record().status).toBe("failed");
    expect(record().errors?.join(" ")).toContain("start veto");
    expect(runner.execute).not.toHaveBeenCalled();
    expect(record().resultCommit).toBeUndefined();
  });

  it("retains failed notification output without vetoing verification", async () => {
    hooks.dispatch.mockImplementation(async () =>
      [{ name: "notification", type: "notify", ok: false, exitCode: 7, output: "notification output" }]);
    await execute();
    expect(record().status).toBe("completed");
    expect(record().diagnostics?.some(item => item.message.includes("notification output"))).toBe(true);
  });

  it("retains approval when completion notification fails", async () => {
    hooks.dispatch.mockImplementation(async (context: HookContext) => {
      if (context.event === "task.completed") throw new Error("notification failed");
      return [];
    });
    await execute();
    expect(record().status).toBe("completed");
    expect(record().resultCommit).toBeTruthy();
    expect(record().diagnostics?.at(-1)?.message).toBe("notification failed");
  });
});
