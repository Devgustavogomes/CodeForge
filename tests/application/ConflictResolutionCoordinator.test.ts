import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { IntegrationCoordinator } from "../../src/scheduler/IntegrationCoordinator.js";
import { ConflictResolutionCoordinator } from "../../src/scheduler/ConflictResolutionCoordinator.js";
import { TaskExecutor } from "../../src/scheduler/TaskExecutor.js";
import { PromptService } from "../../src/application/services/PromptService.js";
import { NodeGitGateway } from "../../src/infrastructure/git/NodeGitGateway.js";
import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { AgentRunner, TaskContext } from "../../src/runners/AgentRunner.js";
import { TaskBuilder } from "../helpers/task-builder.js";
import { TaskScheduler } from "../../src/scheduler/TaskScheduler.js";
import { DAGResolver } from "../../src/scheduler/DAGResolver.js";

describe("bounded conflict resolution with real Git", { timeout: 30000 }, () => {
  let directory: string;
  let integration: string;
  let base: string;
  let repo: ExecutionStateRepository;
  let git: NodeGitGateway;
  let coordinator: IntegrationCoordinator;
  let resolver: ConflictResolutionCoordinator;
  let prompts: string[];
  let runAgent: ReturnType<typeof vi.fn<(context: TaskContext) => Promise<void>>>;
  let verify: ReturnType<typeof vi.fn<() => Promise<void>>>;
  const tasks = ["A", "B", "C", "D"].map(id => TaskBuilder.aTask().withId(id).build());
  const command = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), "codeforge-conflict-"));
    command(directory, "init", "-b", "main");
    command(directory, "config", "user.name", "Test");
    command(directory, "config", "user.email", "test@example.com");
    writeFileSync(path.join(directory, ".gitignore"), ".codeforge/\nintegration/\nA/\nB/\nC/\nD/\n");
    writeFileSync(path.join(directory, "shared.txt"), "base\n");
    command(directory, "add", ".");
    command(directory, "commit", "-m", "base");
    base = command(directory, "rev-parse", "HEAD");
    integration = path.join(directory, "integration");
    command(directory, "worktree", "add", "-b", "codex/integration", integration, base);
    const gw = new NodeWorkspaceGateway(directory);
    repo = new ExecutionStateRepository(gw);
    const state = repo.init("run", tasks);
    Object.assign(state, { repositoryPath: directory, originalWorktreePath: directory,
      integrationBranch: "codex/integration", integrationWorktreePath: integration, lastAcceptedCommit: base });
    state.tasks.D.dependencies = ["B"];
    repo.save(state);
    git = new NodeGitGateway(directory);
    prompts = [];
    runAgent = vi.fn(async (context: TaskContext) => {
      expect(context.cwd).toBe(integration);
      const prompt = readFileSync(context.promptFilePath, "utf8");
      prompts.push(prompt);
      expect(prompt).toContain("Central orchestration directory: " + path.resolve(directory));
      expect(prompt).toContain("Conflicted files: shared.txt");
      expect(prompt).toContain("Incoming result:");
      expect(prompt).toContain("CONFLICT");
      writeFileSync(path.join(context.cwd, "shared.txt"), "A and B\n");
      git.stageAll(context.cwd);
    });
    verify = vi.fn(async () => {});
    const hooks = { dispatch: vi.fn(async (context: { event: string; cwd: string }) => {
      expect(context.event).toBe("task.verify");
      expect(context.cwd).toBe(integration);
      await verify();
      return [];
    }) };
    const executor = new TaskExecutor({ execute: runAgent } as unknown as AgentRunner,
      { environment: "codex", executorAgent: "default", plannerAgent: "default", language: "en" },
      repo, new PromptService(gw, directory), directory, git);
    resolver = new ConflictResolutionCoordinator(repo, git, {
      resolve: (name, id, cwd) => executor.resolveConflict(name, tasks.find(task => task.id === id)!, { cwd }),
      verify: (name, id, cwd) => executor.verify(name, id, hooks, cwd),
    });
    coordinator = new IntegrationCoordinator(repo, git, resolver);
    coordinator.acquire("run");
  });

  afterEach(() => {
    if (repo.load("run")?.integrationOwner) coordinator.release("run");
    // Exact temporary root owned by this test.
    rmSync(directory, { recursive: true, force: true });
  });

  function approve(id: string, file = "shared.txt", content = id + "\n"): void {
    const cwd = path.join(directory, id);
    command(directory, "worktree", "add", "-b", "codex/" + id, cwd, base);
    writeFileSync(path.join(cwd, file), content);
    command(cwd, "add", ".");
    command(cwd, "commit", "-m", id);
    const resultCommit = command(cwd, "rev-parse", "HEAD");
    repo.updateTask("run", id, task => Object.assign(task, { status: "completed", branch: "codex/" + id,
      worktreePath: cwd, baseCommit: base, resultCommit, integration: { status: "pending", resultCommit } }));
  }

  it("invokes the resolver only on conflict and accepts a gated merged result", async () => {
    approve("A");
    await coordinator.drain("run");
    expect(runAgent).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    approve("B");
    let interruptedState: string | undefined;
    const updateTask = repo.updateTask.bind(repo);
    const capture = vi.spyOn(repo, "updateTask").mockImplementation((name, id, transition) => {
      const saved = updateTask(name, id, transition);
      if (saved.tasks.B.integration?.resolution?.status === "succeeded" &&
          saved.tasks.B.integration.status === "running") interruptedState = JSON.stringify(saved);
      return saved;
    });
    await coordinator.drain("run");
    capture.mockRestore();
    const state = repo.load("run")!;
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(state.tasks.B.integration?.resolution).toMatchObject({ attempts: 1, status: "succeeded", conflicts: [] });
    expect(state.tasks.B.integration?.status).toBe("succeeded");
    expect(state.lastAcceptedCommit).toBe(command(integration, "rev-parse", "HEAD"));
    expect(git.isAncestor(integration, state.tasks.B.resultCommit!, state.lastAcceptedCommit!)).toBe(true);
    expect(readFileSync(path.join(integration, "shared.txt"), "utf8")).toBe("A and B\n");
    expect(command(directory, "rev-parse", "HEAD")).toBe(base);
    // Recover a crash between preserving gate-approved merge evidence and accepting it.
    expect(interruptedState).toBeDefined();
    // Restore the actual pre-acceptance disk image, rather than rewriting immutable outcomes.
    writeFileSync(path.join(directory, ".codeforge/executions/run.json"), interruptedState!);
    await coordinator.drain("run");
    expect(repo.load("run")!.tasks.B.integration!.acceptedCommit).toBe(state.lastAcceptedCommit);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("feeds failed gates into the second prompt and preserves first-attempt edits", async () => {
    approve("A");
    approve("B");
    verify.mockImplementationOnce(async () => { throw new Error("Gate test failed: missing behavior"); });
    runAgent.mockImplementationOnce(async context => {
      prompts.push(readFileSync(context.promptFilePath, "utf8"));
      writeFileSync(path.join(integration, "shared.txt"), "first resolution\n");
      git.stageAll(integration);
    }).mockImplementationOnce(async context => {
      const prompt = readFileSync(context.promptFilePath, "utf8");
      expect(prompt).toContain("Gate test failed: missing behavior");
      expect(readFileSync(path.join(integration, "shared.txt"), "utf8")).toBe("first resolution\n");
      prompts.push(prompt);
      writeFileSync(path.join(integration, "shared.txt"), "approved resolution\n");
      git.stageAll(integration);
    });
    await coordinator.drain("run");
    expect(repo.load("run")!.tasks.B.integration?.resolution).toMatchObject({ attempts: 2, status: "succeeded" });
    expect(verify).toHaveBeenCalledTimes(2);
    expect(repo.load("run")!.tasks.B.integration?.resolution?.promptPaths).toHaveLength(2);
  });

  it.each(["unresolved", "agent", "gate"] as const)("exhausts two %s failures across restart without discarding work", async mode => {
    approve("A");
    await coordinator.drain("run");
    const accepted = repo.load("run")!.lastAcceptedCommit;
    approve("B");
    if (mode === "unresolved") runAgent.mockImplementation(async () => {
      writeFileSync(path.join(integration, "partial.txt"), "retained work");
    });
    if (mode === "agent") runAgent.mockImplementation(async () => {
      writeFileSync(path.join(integration, "partial.txt"), "retained work");
      throw new Error("Agent unavailable");
    });
    if (mode === "gate") verify.mockImplementation(async () => { throw new Error("Gate rejected"); });
    // Simulate an interruption after reserving the first attempt, before launch.
    const result = git.integrate(integration, repo.load("run")!.tasks.B.resultCommit!);
    repo.updateTask("run", "B", (task, state) => {
      const id = "interrupted-conflict";
      task.integration = { status: "running", resultCommit: task.resultCommit, operationId: id,
        resolution: { id, incomingCommit: task.resultCommit!, lastAcceptedCommit: accepted!,
          worktreePath: integration, attempts: 1, status: "running", conflicts: result.conflicts, diagnostics: [result.diagnostics] } };
      (state.operations ??= []).push({ id, runId: state.runId!, taskId: "B", attempt: 0, kind: "integration",
        status: "intended", intendedAt: new Date().toISOString(),
        before: { repositoryPath: directory, branch: "codex/integration", worktreePath: integration, headCommit: accepted! },
        source: { repositoryPath: directory, branch: "codex/B", worktreePath: path.join(directory, "B"), headCommit: task.resultCommit! },
        expectedAfter: { repositoryPath: directory, branch: "codex/integration", worktreePath: integration, headCommit: null } });
    });
    coordinator.release("run");
    repo = new ExecutionStateRepository(new NodeWorkspaceGateway(directory));
    // New coordinator reads the persisted counter; the same resolver uses that central repository on disk.
    coordinator = new IntegrationCoordinator(repo, git, resolver);
    coordinator.acquire("run");
    await coordinator.drain("run");
    await coordinator.drain("run");
    const state = repo.load("run")!;
    expect(state.tasks.B.integration?.resolution).toMatchObject({ attempts: 2, status: "exhausted" });
    expect(state.tasks.B.integration?.status).toBe("blocked");
    expect(state.lastAcceptedCommit).toBe(accepted);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(mode === "gate" ? 1 : 0);
    expect(new DAGResolver().getReadyTasks(state)).toEqual(["C"]);
    if (mode !== "gate") {
      expect(git.getConflicts(integration)).toEqual(["shared.txt"]);
      expect(readFileSync(path.join(integration, "partial.txt"), "utf8")).toBe("retained work");
    } else expect(readFileSync(path.join(integration, "shared.txt"), "utf8")).toBe("A and B\n");
    expect(state.tasks.B.integration?.resolution?.diagnostics.join("\n")).toContain("interrupted");
  });

  it("lets an independent agent finish while exhausted integration blocks dependents", async () => {
    approve("A");
    await coordinator.drain("run");
    approve("B");
    coordinator.release("run");
    // The scheduler acquires its own integration transaction.
    const gw = new NodeWorkspaceGateway(directory);
    gw.mkdir(".codeforge/tasks/run");
    for (const task of tasks) gw.writeFile(".codeforge/tasks/run/" + task.id + ".json", JSON.stringify(task));
    const runner = { execute: vi.fn(async (context: TaskContext) => {
      if (context.taskId === "B") throw new Error("Resolver crashed");
      expect(context.taskId).toBe("C");
      expect(context.cwd).toBe(path.join(directory, "C"));
      await new Promise(resolve => setTimeout(resolve, 20));
      writeFileSync(path.join(context.cwd, "independent.txt"), "finished");
    }) } as unknown as AgentRunner;
    const scheduler = new TaskScheduler({
      cwd: directory, gw, runner, stateRepo: repo, promptService: new PromptService(gw, directory),
      config: { environment: "codex", executorAgent: "default", plannerAgent: "default", language: "en" },
      integrationGit: git, conflictResolutionGit: git, taskResultGit: git,
      worktreeLifecycle: {
        initializeRun: async () => repo.load("run")!,
        prepareIntegration: async () => ({ directory: integration, branch: "codex/integration", baseCommit: base }),
        getIntegrationCommit: () => repo.load("run")!.lastAcceptedCommit!,
        prepareTask: async (_intent, id, fixedBase) => {
          const owned = git.createWorktree(directory, repo.load("run")!.runId!, id, fixedBase);
          repo.updateTask("run", id, task => {
            Object.assign(task, { branch: owned.branch, worktreePath: owned.directory, baseCommit: fixedBase });
            (task.stages ??= {}).preparation = { status: "succeeded" };
          });
          return owned;
        },
      },
    });
    // Capture the actual generated worktree, whose unique path is assigned during preparation.
    vi.mocked(runner.execute).mockImplementation(async context => {
      if (context.taskId === "B") throw new Error("Resolver crashed");
      expect(context.taskId).toBe("C");
      expect(context.cwd).toBe(repo.load("run")!.tasks.C.worktreePath);
      writeFileSync(path.join(context.cwd, "independent.txt"), "finished");
    });
    const result = await scheduler.run("run", { skipReview: true });
    const state = repo.load("run")!;
    expect(result.status).toBe("failed");
    expect(state.tasks.B.integration?.resolution).toMatchObject({ attempts: 2, status: "exhausted" });
    expect(state.tasks.D.status).toBe("pending");
    expect(state.tasks.C.status).toBe("completed");
    expect(state.tasks.C.resultCommit).toBeTruthy();
    expect(state.tasks.C.integration?.status).toBe("pending");
    expect(readFileSync(path.join(state.tasks.C.worktreePath!, "independent.txt"), "utf8")).toBe("finished");
    expect(git.getConflicts(integration)).toEqual(["shared.txt"]);
    coordinator.acquire("run");
  });

  it("accepts a resumed resolution with the latest attempt diagnostics", async () => {
    approve("A");
    await coordinator.drain("run");
    approve("B");
    const accepted = repo.load("run")!.lastAcceptedCommit!;
    const result = git.integrate(integration, repo.load("run")!.tasks.B.resultCommit!);
    repo.updateTask("run", "B", (task, state) => {
      const id = "resumed-conflict";
      task.integration = { status: "running", resultCommit: task.resultCommit, operationId: id,
        resolution: { id, incomingCommit: task.resultCommit!, lastAcceptedCommit: accepted,
          worktreePath: integration, attempts: 1, status: "running", conflicts: result.conflicts,
          diagnostics: [result.diagnostics] } };
      (state.operations ??= []).push({ id, runId: state.runId!, taskId: "B", attempt: 0, kind: "integration",
        status: "intended", intendedAt: new Date().toISOString(),
        before: { repositoryPath: directory, branch: "codex/integration", worktreePath: integration, headCommit: accepted },
        source: { repositoryPath: directory, branch: "codex/B", worktreePath: path.join(directory, "B"), headCommit: task.resultCommit! },
        expectedAfter: { repositoryPath: directory, branch: "codex/integration", worktreePath: integration, headCommit: null } });
    });
    coordinator.release("run");
    coordinator = new IntegrationCoordinator(repo, git, resolver);
    coordinator.acquire("run");
    await coordinator.drain("run");
    const state = repo.load("run")!;
    expect(state.tasks.B.integration?.resolution).toMatchObject({ attempts: 2, status: "succeeded" });
    expect(state.tasks.B.integration?.status).toBe("succeeded");
    expect(state.operations!.find(operation => operation.id === "resumed-conflict")!.outcome!.diagnostics)
      .toEqual(state.tasks.B.integration!.resolution!.diagnostics);
    expect(state.tasks.B.integration!.resolution!.diagnostics.join("\n")).toContain("interrupted");
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("does not launch a third agent after two failures in one run", async () => {
    approve("A");
    approve("B");
    runAgent.mockRejectedValue(new Error("Agent crashed"));
    await coordinator.drain("run");
    const diagnostics = repo.load("run")!.tasks.B.integration!.resolution!.diagnostics;
    await coordinator.drain("run");
    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(verify).not.toHaveBeenCalled();
    expect(repo.load("run")!.tasks.B.integration!.resolution!.diagnostics).toEqual(diagnostics);
    expect(git.getConflicts(integration)).toEqual(["shared.txt"]);
  });
});
