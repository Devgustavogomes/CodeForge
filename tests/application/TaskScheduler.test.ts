import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { WorktreeLifecycle } from "../../src/infrastructure/worktrees/WorktreeLifecycle.js";
import { NodeGitGateway } from "../../src/infrastructure/git/NodeGitGateway.js";
import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { FakeProcessExecutor } from "../helpers/fake-process-executor.js";
import { fakeWorktreeLifecycle, fakeDeliveryGit, fakeTaskResultGit, fakeRecoveryCoordinator } from "../helpers/fake-worktree-lifecycle.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExecutionRecoveryCoordinator } from "../../src/scheduler/ExecutionRecoveryCoordinator.js";
import { IntegrationCoordinator } from "../../src/scheduler/IntegrationCoordinator.js";
import { TaskScheduler } from "../../src/scheduler/TaskScheduler.js";
import { SchedulerRunResult } from "../../src/scheduler/types.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { InMemoryAgentRunner } from "../helpers/in-memory-agent-runner.js";
import { TaskBuilder } from "../helpers/task-builder.js";
import { CodeForgeConfig } from "../../src/config/types.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../src/application/services/PromptService.js";
import { SchedulerReporter } from "../../src/application/ports/SchedulerReporter.js";
import { HookDispatcher } from "../../src/application/ports/HookDispatcher.js";
import { HookContext, HookResult } from "../../src/domain/hook.js";
import { Task } from "../../src/domain/task.js";
import { IntentExecutionState } from "../../src/domain/execution.js";
import { ExecuteReviewUseCase } from "../../src/application/use-cases/ExecuteReviewUseCase.js";
import { ValidatePlanUseCase } from "../../src/application/use-cases/ValidatePlanUseCase.js";
import { PATHS } from "../../src/infrastructure/paths.js";

class StubHookDispatcher implements HookDispatcher {
  constructor(private readonly results: HookResult[] = []) {}

  async dispatch(context: HookContext): Promise<HookResult[]> {
    if (context.event === "task.verify") {
      return this.results;
    }
    return [];
  }
}

describe("TaskScheduler", () => {
  let gw: InMemoryWorkspaceGateway;
  let runner: InMemoryAgentRunner;
  let config: CodeForgeConfig;
  let stateRepo: ExecutionStateRepository;
  let promptService: PromptService;
  let reporter: SchedulerReporter;
  let scheduler: TaskScheduler;
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;

    gw = new InMemoryWorkspaceGateway();
    runner = new InMemoryAgentRunner();
    config = {
      environment: "test",
      plannerAgent: "planner-mock",
      executorAgent: "executor-mock",
      language: "en",
    };
    stateRepo = new ExecutionStateRepository(gw);
    promptService = new PromptService(gw);
    reporter = {
      onOutcome: vi.fn(),
      onWarning: vi.fn(),
      onStart: vi.fn(),
      onComplete: vi.fn(),
      onFail: vi.fn(),
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onDeadlock: vi.fn(),
      onLog: vi.fn(),
    };

    scheduler = new TaskScheduler({
      recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo),
      taskResultGit: fakeTaskResultGit(),
      deliveryGit: fakeDeliveryGit(stateRepo, "test-intent"),
      integrationGit: fakeTaskResultGit(),
      gw,
      runner,
      config,
      stateRepo,
      promptService,
      reporter,
    });

    gw.mkdir(".codeforge/tasks/test-intent");
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  function acceptCompletedFixture(): void {
    stateRepo.update("test-intent", state => {
      delete state.recovery;
      state.runId = "fixture-run";
      state.repositoryPath = process.cwd();
      state.originalBranch = "main";
      state.originalCommit = "a".repeat(40);
      state.originalWorktreePath = state.repositoryPath;
      state.integrationBranch = "codex/test";
      state.integrationWorktreePath = "integration";
      state.lastAcceptedCommit = "a".repeat(40);
      for (const task of Object.values(state.tasks)) {
        task.branch = "codex/test";
        task.worktreePath = "isolated-task";
        task.baseCommit = task.resultCommit = "a".repeat(40);
        task.integration = { status: "succeeded", resultCommit: task.resultCommit, acceptedCommit: state.lastAcceptedCommit };
      }
    });
  }

  function writeTask(intentName: string, task: Task): void {
    gw.mkdir(`.codeforge/tasks/${intentName}`);
    gw.writeFile(`.codeforge/tasks/${intentName}/${task.id}.json`, JSON.stringify(task));
  }

  it("reports cleanup warnings without revoking delivery or suppressing completion hooks", async () => {
    writeTask("test-intent", TaskBuilder.aTask().build());
    const dispatch = vi.fn(async () => []);
    const execution = new TaskScheduler({ gw, runner, config, stateRepo, promptService, reporter,
      recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo),
      taskResultGit: fakeTaskResultGit(), integrationGit: fakeTaskResultGit(),
      deliveryGit: fakeDeliveryGit(stateRepo, "test-intent"), hooks: { dispatch },
      cleanupCoordinator: { cleanup: async () => { throw new Error("Dirty worktree retained"); } },
    });
    expect((await execution.run("test-intent")).status).toBe("completed");
    expect(reporter.onWarning).toHaveBeenCalledWith(expect.stringContaining("Dirty worktree retained"));
    expect(reporter.onError).not.toHaveBeenCalled();
    expect(reporter.onComplete).toHaveBeenCalledWith("test-intent", expect.objectContaining({
      delivery: expect.objectContaining({ status: "succeeded" }),
      diagnostics: expect.arrayContaining([expect.objectContaining({ stage: "cleanup" })]),
    }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ event: "run.completed" }));
  });

  it("pauses finalization until delivery succeeds and retries without rerunning tasks", async () => {
    const task = TaskBuilder.aTask().build();
    writeTask("test-intent", task);
    const deliveryGit = fakeDeliveryGit(stateRepo, "test-intent");
    const update = vi.spyOn(deliveryGit, "updateOriginalBranch").mockReturnValueOnce(false);
    const dispatch = vi.fn(async (context: HookContext) => {
      if (context.event === "run.started") stateRepo.update("test-intent", state => { state.originalCommit = "b".repeat(40); });
      return [];
    });
    const execution = new TaskScheduler({ gw, runner, config, stateRepo, promptService, reporter,
      recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo), taskResultGit: fakeTaskResultGit(),
      integrationGit: fakeTaskResultGit(), deliveryGit, hooks: { dispatch } });
    expect((await execution.run("test-intent")).status).toBe("paused");
    expect(stateRepo.load("test-intent")?.delivery?.status).toBe("pending");
    expect(stateRepo.load("test-intent")?.completedAt).toBeUndefined();
    expect(reporter.onComplete).not.toHaveBeenCalled();
    expect(dispatch.mock.calls.some(([context]) => context.event === "run.completed")).toBe(false);
    const executions = runner.executedContexts.length;
    expect(await execution.run("test-intent")).toEqual({ status: "completed", intentName: "test-intent" });
    expect(runner.executedContexts).toHaveLength(executions);
    expect(update).toHaveBeenCalledTimes(2);
    expect(reporter.onComplete).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls.filter(([context]) => context.event === "task.verify")).toHaveLength(1);
  });

  it("finalizes recovered delivery without recreating removed integration worktrees", async () => {
    const task = TaskBuilder.aTask().build();
    writeTask("test-intent", task);
    expect((await scheduler.run("test-intent")).status).toBe("completed");
    stateRepo.update("test-intent", state => { state.status = "running"; delete state.completedAt; });
    const worktrees = fakeWorktreeLifecycle(stateRepo);
    const prepare = vi.spyOn(worktrees, "prepareIntegration").mockRejectedValue(new Error("Worktree already cleaned"));
    const resumed = new TaskScheduler({ gw, runner, config, stateRepo, promptService,
      worktreeLifecycle: worktrees, recoveryCoordinator: fakeRecoveryCoordinator(stateRepo),
      cleanupCoordinator: { cleanup: async () => ({ failures: [] }) } });
    expect((await resumed.run("test-intent")).status).toBe("completed");
    expect(prepare).not.toHaveBeenCalled();
    expect(stateRepo.load("test-intent")!.status).toBe("completed");
    expect(runner.executedContexts).toHaveLength(1);
  });

  it("does not deliver when required review rounds are exhausted without approval", async () => {
    const task = TaskBuilder.aTask().build();
    writeTask("test-intent", task);
    config.aiReview = { enabled: true, maxRounds: 0 };
    expect((await scheduler.run("test-intent")).status).toBe("paused");
    expect(stateRepo.load("test-intent")?.delivery?.deliveredCommit).toBeUndefined();
    expect(reporter.onComplete).not.toHaveBeenCalled();
  });

  it("settles a restarted running task without waiting for a missing completion promise", async () => {
    const task = TaskBuilder.aTask().build();
    writeTask("test-intent", task);
    const state = stateRepo.init("test-intent", [task]);
    state.tasks[task.id].status = "running";
    stateRepo.save(state);
    const result = await scheduler.run("test-intent", { skipReview: true });
    expect(result.status).toBe("completed");
    expect(stateRepo.load("test-intent")?.tasks[task.id].diagnostics?.some(entry => entry.stage === "recovery")).toBe(true);
    expect(runner.executedContexts).toHaveLength(1);
  });

  it("returns promptly when prior work is active but this orchestrator has no promise", async () => {
    const task = TaskBuilder.aTask().build();
    writeTask("test-intent", task);
    const state = stateRepo.init("test-intent", [task]);
    state.tasks[task.id].status = "running";
    stateRepo.save(state);
    stateRepo.update("test-intent", current => { current.integrationOwner = { pid: process.pid, host: os.hostname(),
      token: "live-owner", startedAt: new Date().toISOString() }; });
    try {
      const result = await scheduler.run("test-intent", { skipReview: true });
      expect(result.status).toBe("paused");
      expect(result.reason).toContain("remain live");
      expect(runner.executedContexts).toHaveLength(0);
      expect(stateRepo.load("test-intent")?.tasks[task.id].status).toBe("running");
    } finally { stateRepo.update("test-intent", current => { delete current.integrationOwner; }); }
  });

  describe("SchedulerRunResult and exit code purity", () => {
    it("should return failed and not mutate process.exitCode if no tasks are found", async () => {
      const result = await scheduler.run("test-intent");

      expect(result).toEqual<SchedulerRunResult>({
        status: "failed",
        intentName: "test-intent",
        reason: "No tasks found for intent: test-intent",
      });
      expect(result.intentName).toBe("test-intent");
      expect(reporter.onError).toHaveBeenCalledWith(expect.any(Error));
      expect(process.exitCode).toBeUndefined();
    });

    it("should return completed and not mutate process.exitCode on successful run", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").withTitle("Task 1").build();
      writeTask("test-intent", task);

      const result = await scheduler.run("test-intent");

      expect(result).toEqual<SchedulerRunResult>({
        status: "completed",
        intentName: "test-intent",
      });
      expect(result.intentName).toBe("test-intent");
      expect(process.exitCode).toBeUndefined();
      expect(reporter.onComplete).toHaveBeenCalledWith("test-intent", expect.objectContaining({ delivery: expect.objectContaining({ status: "succeeded" }) }));

      const finalState = stateRepo.load("test-intent");
      expect(finalState?.status).toBe("completed");
      expect(finalState?.tasks["TASK-001"].status).toBe("completed");
      expect(runner.hasExecuted("TASK-001")).toBe(true);
    });

    it("should return failed and not mutate process.exitCode when a task fails", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      runner.withErrorForTask("TASK-001", new Error("Agent failed"));

      const result = await scheduler.run("test-intent");

      expect(result).toEqual<SchedulerRunResult>({
        status: "failed",
        intentName: "test-intent",
        reason: "One or more tasks failed.",
      });
      expect(result.intentName).toBe("test-intent");
      expect(process.exitCode).toBeUndefined();
      expect(reporter.onFail).toHaveBeenCalledWith("test-intent");

      const finalState = stateRepo.load("test-intent");
      expect(finalState?.status).toBe("failed");
      expect(finalState?.tasks["TASK-001"].status).toBe("failed");
      expect(finalState?.tasks["TASK-001"].errors).toEqual(["Agent failed"]);
    });

    it("should return deadlock and not mutate process.exitCode when circular dependency occurs", async () => {
      const task1 = TaskBuilder.aTask().withId("TASK-001").withDependencies(["TASK-002"]).build();
      const task2 = TaskBuilder.aTask().withId("TASK-002").withDependencies(["TASK-001"]).build();
      writeTask("test-intent", task1);
      writeTask("test-intent", task2);

      const result = await scheduler.run("test-intent");

      expect(result).toEqual<SchedulerRunResult>({
        status: "deadlock",
        intentName: "test-intent",
      });
      expect(result.intentName).toBe("test-intent");
      expect(process.exitCode).toBeUndefined();
      expect(reporter.onDeadlock).toHaveBeenCalledWith("test-intent");

      const finalState = stateRepo.load("test-intent");
      expect(finalState?.status).toBe("failed");
    });
  });

  describe("state transitions", () => {
    it("should transition tasks from pending to running to completed", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      let observedRunningState: string | undefined;
      runner.withHandler(async (context) => {
        const midState = stateRepo.load("test-intent");
        observedRunningState = context.taskId ? midState?.tasks[context.taskId]?.status : undefined;
      });

      const result = await scheduler.run("test-intent");

      expect(observedRunningState).toBe("running");
      expect(result.status).toBe("completed");

      const finalState = stateRepo.load("test-intent");
      expect(finalState?.tasks["TASK-001"].status).toBe("completed");
      expect(finalState?.tasks["TASK-001"].startedAt).toBeDefined();
      expect(finalState?.tasks["TASK-001"].completedAt).toBeDefined();
    });

    it("should transition tasks from pending to running to failed on runner error", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      let observedRunningState: string | undefined;
      runner.withHandler(async (context) => {
        const midState = stateRepo.load("test-intent");
        observedRunningState = context.taskId ? midState?.tasks[context.taskId]?.status : undefined;
        throw new Error("Execution exploded");
      });

      const result = await scheduler.run("test-intent");

      expect(observedRunningState).toBe("running");
      expect(result.status).toBe("failed");

      const finalState = stateRepo.load("test-intent");
      expect(finalState?.tasks["TASK-001"].status).toBe("failed");
      expect(finalState?.tasks["TASK-001"].errors).toEqual(["Execution exploded"]);
    });

    it("should return immediately if state is already completed", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      const existingState: IntentExecutionState = {
        intentId: "test-intent",
        status: "completed",
        updatedAt: new Date().toISOString(),
        tasks: {
          "TASK-001": { status: "completed", dependencies: [] },
        },
      };
      stateRepo.save(existingState);
      if (existingState.status === "completed") acceptCompletedFixture();

      const result = await scheduler.run("test-intent");

      expect(result).toEqual<SchedulerRunResult>({
        status: "completed",
        intentName: "test-intent",
      });
      expect(result.intentName).toBe("test-intent");
      expect(reporter.onComplete).toHaveBeenCalledWith("test-intent", expect.objectContaining({ delivery: expect.objectContaining({ status: "succeeded" }) }));
      expect(runner.executedContexts).toHaveLength(0);
    });

    it("pauses legacy failed state until Git evidence is reconciled", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      const existingState: IntentExecutionState = {
        intentId: "test-intent",
        status: "failed",
        updatedAt: new Date().toISOString(),
        tasks: {
          "TASK-001": { status: "failed", dependencies: [] },
        },
      };
      stateRepo.save(existingState);

      const result = await scheduler.run("test-intent");

      expect(result).toEqual<SchedulerRunResult>({
        status: "paused",
        intentName: "test-intent",
        reason: "Legacy execution requires recorded Git ownership evidence before recovery.",
      });
      expect(result.intentName).toBe("test-intent");
      expect(runner.executedContexts).toHaveLength(0);
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe("review output recovery", () => {

    it("waits for queued integrations before review", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);
      const initial = stateRepo.init("test-intent", [task]);
      initial.runId = "fixture-run";
      initial.tasks[task.id].status = "completed";
      stateRepo.save(initial);
      acceptCompletedFixture();
      stateRepo.update("test-intent", state => { state.integrationQueue = [task.id]; state.tasks[task.id].integration!.status = "pending"; });
      const drain = vi.spyOn(IntegrationCoordinator.prototype, "drain").mockResolvedValue();
      const reviewUseCase = { execute: vi.fn() } as unknown as ExecuteReviewUseCase;
      const deliveryGit = fakeDeliveryGit(stateRepo, "test-intent");
      const deliver = vi.spyOn(deliveryGit, "updateOriginalBranch");
      config.aiReview = { enabled: true };
      try {
        const scheduler = new TaskScheduler({ gw, runner, config, stateRepo, promptService, reviewUseCase, deliveryGit,
          recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo), integrationGit: fakeTaskResultGit() });
        expect(await scheduler.run("test-intent")).toMatchObject({ status: "paused", reason: expect.stringContaining("missing approval or integration evidence") });
        expect(reviewUseCase.execute).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
      } finally { drain.mockRestore(); }
    });

    it("keeps delivery pending when review approves but the original checkout has changed", async () => {
      gw.writeFile(PATHS.metadata, "{}");
      writeTask("test-intent", TaskBuilder.aTask().withId("TASK-001").build());
      config.aiReview = { enabled: true };
      const deliveryGit = fakeDeliveryGit(stateRepo, "test-intent");
      const deliver = vi.spyOn(deliveryGit, "updateOriginalBranch");
      const reviewUseCase = { execute: vi.fn(async () => {
        vi.spyOn(deliveryGit, "getStatus").mockImplementation(directory =>
          directory === stateRepo.load("test-intent")?.originalWorktreePath
            ? [{ path: "user.txt", index: "?", worktree: "?", kind: "untracked" }] : []);
        return { newTaskIds: [], newTaskFiles: [] };
      }) } as unknown as ExecuteReviewUseCase;
      const scheduler = new TaskScheduler({ gw, runner, config, stateRepo, promptService, reviewUseCase, deliveryGit,
        recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo), taskResultGit: fakeTaskResultGit(),
        integrationGit: fakeTaskResultGit(), validatePlanUseCase: new ValidatePlanUseCase(gw) });
      expect(await scheduler.run("test-intent")).toMatchObject({ status: "paused", reason: expect.stringContaining("Original index") });
      expect(reviewUseCase.execute).toHaveBeenCalledOnce();
      expect(stateRepo.load("test-intent")?.reviewApproved).toBe(true);
      expect(stateRepo.load("test-intent")?.delivery?.status).toBe("pending");
      expect(deliver).not.toHaveBeenCalled();
    });

    it("announces review, pauses for new tasks, and executes them on the next run", async () => {
      writeTask("test-intent", TaskBuilder.aTask().withId("TASK-001").build());
      gw.writeFile(PATHS.metadata, "{}");
      config.aiReview = { enabled: true, agent: "reviewer", maxRounds: 3 };
      reporter.onReviewStart = vi.fn();
      reporter.onReviewEnd = vi.fn();
      const reviewUseCase = {
        execute: vi.fn()
          .mockImplementationOnce(async () => {
            writeTask("test-intent", TaskBuilder.aTask().withId("TASK-002").withDependencies(["TASK-001"]).build());
            return { newTaskFiles: ["TASK-002.json"], newTaskIds: ["TASK-002"] };
          })
          .mockResolvedValue({ newTaskFiles: [], newTaskIds: [] }),
      } as unknown as ExecuteReviewUseCase;
      const reviewScheduler = new TaskScheduler({
      recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo),
      taskResultGit: fakeTaskResultGit(),
      deliveryGit: fakeDeliveryGit(stateRepo, "test-intent"),
      integrationGit: fakeTaskResultGit(),
        gw, runner, config, stateRepo, promptService, reporter, reviewUseCase,
        validatePlanUseCase: new ValidatePlanUseCase(gw),
      });

      const first = await reviewScheduler.run("test-intent");
      expect(first).toMatchObject({ status: "pending", newTasks: ["TASK-002"] });
      expect(reporter.onReviewStart).toHaveBeenCalledWith("test-intent", { agent: "reviewer", round: 1, maxRounds: 3 });
      expect(reporter.onReviewEnd).toHaveBeenCalledWith("test-intent", {
        outcome: "tasks_created", newTasksCount: 1, taskIds: ["TASK-002"],
      });
      expect(runner.hasExecuted("TASK-002")).toBe(false);

      const beforeFollowUp = stateRepo.load("test-intent")!;
      expect(beforeFollowUp.reviewApproved).toBe(false);
      expect(beforeFollowUp.tasks["TASK-002"]).toMatchObject({ status: "pending", attempt: 0, integration: { status: "pending" } });
      expect(beforeFollowUp.delivery?.deliveredCommit).toBeUndefined();
      expect(reviewUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        cwd: beforeFollowUp.integrationWorktreePath,
        accumulatedResult: { directory: beforeFollowUp.integrationWorktreePath,
          baseCommit: beforeFollowUp.originalCommit, resultCommit: beforeFollowUp.lastAcceptedCommit },
      }));


      const second = await reviewScheduler.run("test-intent");
      expect(second.status).toBe("completed");
      expect(runner.hasExecuted("TASK-002")).toBe(true);
      expect(reporter.onReviewEnd).toHaveBeenCalledWith("test-intent", {
        outcome: "approved", newTasksCount: 0, taskIds: [],
      });
    });

    it("removes reviewer tasks with invalid dependencies before they enter execution state", async () => {
      const completed = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", completed);
      gw.writeFile(PATHS.metadata, "{}");
      stateRepo.save({
        intentId: "test-intent", status: "completed", updatedAt: new Date().toISOString(),
        tasks: { "TASK-001": { status: "completed", dependencies: [] } },
      });
      acceptCompletedFixture();
      config.aiReview = { enabled: true, agent: "reviewer", maxRounds: 3 };
      const invalid = { ...TaskBuilder.aTask().withId("TASK-002").build(), dependencies: ["TASK-404"] };
      const reviewUseCase = {
        execute: vi.fn(async () => {
          writeTask("test-intent", invalid);
          return { newTaskFiles: ["TASK-002.json"], newTaskIds: ["TASK-002"] };
        }),
      } as unknown as ExecuteReviewUseCase;
      const reviewScheduler = new TaskScheduler({
      recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo),
      taskResultGit: fakeTaskResultGit(),
      deliveryGit: fakeDeliveryGit(stateRepo, "test-intent"),
      integrationGit: fakeTaskResultGit(),
        gw,
        runner,
        config,
        stateRepo,
        promptService,
        reporter,
        reviewUseCase,
        validatePlanUseCase: new ValidatePlanUseCase(gw),
      });

      await expect(reviewScheduler.run("test-intent", { forceReview: true })).resolves.toMatchObject({ status: "paused" });
      expect(gw.exists(PATHS.taskFile("test-intent", "TASK-002"))).toBe(false);
      expect(stateRepo.load("test-intent")?.tasks["TASK-002"]).toBeUndefined();
      expect(stateRepo.load("test-intent")?.reviewError).toEqual(expect.any(String));
    });

    it("cleans only new invalid reviewer files, preserves completed state, and can retry", async () => {
      const completed = TaskBuilder.aTask().withId("TASK-001").build();
      const preExisting = TaskBuilder.aTask().withId("TASK-099").build();
      writeTask("test-intent", completed);
      writeTask("test-intent", preExisting);
      gw.writeFile(PATHS.metadata, "{}");

      const completedAt = "2026-09-20T12:00:00.000Z";
      stateRepo.save({
        intentId: "test-intent", status: "completed", updatedAt: completedAt,
        tasks: { "TASK-001": { status: "completed", dependencies: [], completedAt } },
      });
      acceptCompletedFixture();
      config.aiReview = { enabled: true, agent: "reviewer", maxRounds: 3 };

      let attempts = 0;
      const reviewUseCase = {
        execute: vi.fn(async () => {
          attempts += 1;
          if (attempts === 1) {
            gw.writeFile(PATHS.taskFile("test-intent", "TASK-002"), "{ malformed");
            return { newTaskFiles: ["TASK-002.json"], newTaskIds: ["TASK-002"] };
          }
          return { newTaskFiles: [], newTaskIds: [] };
        }),
      } as unknown as ExecuteReviewUseCase;
      const reviewScheduler = new TaskScheduler({
      recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo),
      taskResultGit: fakeTaskResultGit(),
      deliveryGit: fakeDeliveryGit(stateRepo, "test-intent"),
      integrationGit: fakeTaskResultGit(),
        gw,
        runner,
        config,
        stateRepo,
        promptService,
        reporter,
        reviewUseCase,
        validatePlanUseCase: new ValidatePlanUseCase(gw),
      });

      await expect(reviewScheduler.run("test-intent", { forceReview: true })).resolves.toMatchObject({ status: "paused" });
      expect(gw.exists(PATHS.taskFile("test-intent", "TASK-002"))).toBe(false);
      expect(gw.exists(PATHS.taskFile("test-intent", "TASK-099"))).toBe(true);
      const paused = stateRepo.load("test-intent");
      expect(paused?.status).toBe("paused");
      expect(paused?.reviewError).toEqual(expect.any(String));
      expect(paused?.tasks["TASK-001"].completedAt).toBe(completedAt);

      await expect(reviewScheduler.run("test-intent")).resolves.toMatchObject({ status: "completed" });
      expect(reviewUseCase.execute).toHaveBeenCalledTimes(2);
      expect(stateRepo.load("test-intent")?.reviewError).toBeUndefined();
    });
  });

  describe("gate hook verification handling", () => {
    it("should complete task and scheduler when gate hook passes", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      const hooks = new StubHookDispatcher([
        { name: "lint", type: "gate", ok: true, exitCode: 0, output: "clean" },
      ]);
      const schedulerWithHooks = new TaskScheduler({
      recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo),
      taskResultGit: fakeTaskResultGit(),
      deliveryGit: fakeDeliveryGit(stateRepo, "test-intent"),
      integrationGit: fakeTaskResultGit(),
        gw,
        runner,
        config,
        stateRepo,
        promptService,
        reporter,
        hooks,
      });

      const result = await schedulerWithHooks.run("test-intent");

      expect(result.status).toBe("completed");
      expect(stateRepo.load("test-intent")?.tasks["TASK-001"].status).toBe("completed");
      expect(process.exitCode).toBeUndefined();
    });

    it("should fail task and scheduler when gate hook fails", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      const hooks = new StubHookDispatcher([
        { name: "unit-tests", type: "gate", ok: false, exitCode: 1, output: "1 test failed" },
      ]);
      const schedulerWithHooks = new TaskScheduler({
      recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo),
      taskResultGit: fakeTaskResultGit(),
      deliveryGit: fakeDeliveryGit(stateRepo, "test-intent"),
      integrationGit: fakeTaskResultGit(),
        gw,
        runner,
        config,
        stateRepo,
        promptService,
        reporter,
        hooks,
      });

      const result = await schedulerWithHooks.run("test-intent");

      expect(result.status).toBe("failed");
      const finalTask = stateRepo.load("test-intent")?.tasks["TASK-001"];
      expect(finalTask?.status).toBe("failed");
      expect(finalTask?.errors).toHaveLength(1);
      expect(finalTask?.errors?.[0]).toEqual(expect.any(String));
      expect(process.exitCode).toBeUndefined();
    });

    it("should not veto task when notify hook exits non-zero", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      const hooks = new StubHookDispatcher([
        { name: "slack-notify", type: "notify", ok: false, exitCode: 2, output: "network error" },
      ]);
      const schedulerWithHooks = new TaskScheduler({
      recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo),
      taskResultGit: fakeTaskResultGit(),
      deliveryGit: fakeDeliveryGit(stateRepo, "test-intent"),
      integrationGit: fakeTaskResultGit(),
        gw,
        runner,
        config,
        stateRepo,
        promptService,
        reporter,
        hooks,
      });

      const result = await schedulerWithHooks.run("test-intent");

      expect(result.status).toBe("completed");
      expect(stateRepo.load("test-intent")?.tasks["TASK-001"].status).toBe("completed");
    });
  });

  describe("DAG execution ordering and error diagnostics", () => {
    it("should run dependent task after integration without waiting for slow parallel task", async () => {
      const taskA = TaskBuilder.aTask().withId("TASK-A").build();
      const taskB = TaskBuilder.aTask().withId("TASK-B").build();
      const taskC = TaskBuilder.aTask().withId("TASK-C").withDependencies(["TASK-B"]).build();

      writeTask("test-intent", taskA);
      writeTask("test-intent", taskB);
      writeTask("test-intent", taskC);

      let taskACompleted = false;
      let taskCStartedBeforeTaskAFinished = false;

      runner.withHandler(async (context) => {
        if (context.taskId === "TASK-A") {
          await new Promise((resolve) => setTimeout(resolve, 80));
          taskACompleted = true;
        } else if (context.taskId === "TASK-B") {
          await new Promise((resolve) => setTimeout(resolve, 15));
        } else if (context.taskId === "TASK-C") {
          if (!taskACompleted) {
            taskCStartedBeforeTaskAFinished = true;
          }
        }
      });

      const result = await scheduler.run("test-intent");

      expect(result.status).toBe("completed");
      expect(taskCStartedBeforeTaskAFinished).toBe(true);

      const finalState = stateRepo.load("test-intent");
      expect(finalState?.tasks["TASK-A"].status).toBe("completed");
      expect(finalState?.tasks["TASK-B"].status).toBe("completed");
      expect(finalState?.tasks["TASK-C"].status).toBe("completed");
    });

    it("should pass previousErrors to promptService.createPromptFile when task has previous errors in state", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      const initialState = stateRepo.init("test-intent", [task]);
      initialState.tasks["TASK-001"].errors = [
        "Prior failure: build error",
        "Prior failure: test failed",
      ];
      stateRepo.save(initialState);

      const createPromptSpy = vi.spyOn(promptService, "createPromptFile");

      const result = await scheduler.run("test-intent");

      expect(result.status).toBe("completed");
      expect(createPromptSpy).toHaveBeenCalledWith(
        "test-intent",
        expect.objectContaining({ id: "TASK-001" }),
        "en",
        ["Prior failure: build error", "Prior failure: test failed"],
        { orchestrationRoot: process.cwd(), executionRoot: stateRepo.load("test-intent")?.tasks["TASK-001"].worktreePath },
      );
    });

    it("should remove errors property from task state upon successful execution", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      const initialState = stateRepo.init("test-intent", [task]);
      initialState.tasks["TASK-001"].errors = ["Previous error to be cleared"];
      stateRepo.save(initialState);

      const result = await scheduler.run("test-intent");

      expect(result.status).toBe("completed");
      const finalTask = stateRepo.load("test-intent")?.tasks["TASK-001"];
      expect(finalTask?.status).toBe("completed");
      expect(finalTask?.errors).toBeUndefined();
      expect("errors" in (finalTask ?? {})).toBe(false);
    });

    it("should accumulate errors in task state and mark task as failed when execution fails", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      const initialState = stateRepo.init("test-intent", [task]);
      initialState.tasks["TASK-001"].errors = ["First error"];
      stateRepo.save(initialState);

      runner.withErrorForTask("TASK-001", new Error("Second error occurred"));

      const result = await scheduler.run("test-intent");

      expect(result.status).toBe("failed");
      const finalTask = stateRepo.load("test-intent")?.tasks["TASK-001"];
      expect(finalTask?.status).toBe("failed");
      expect(finalTask?.errors).toEqual(["First error", "Second error occurred"]);
      expect(reporter.onFail).toHaveBeenCalledWith("test-intent");
      expect(process.exitCode).toBeUndefined();
    });
  });

  it.each(["task", "integration"])("keeps independent chains progressing after a %s failure", async failure => {
    for (const [id, dependencies] of [["A", []], ["B", ["A"]], ["C", []], ["D", ["C"]]] as const) {
      writeTask("test-intent", TaskBuilder.aTask().withId(id).withDependencies([...dependencies]).build());
    }
    const integrationGit = fakeTaskResultGit();
    if (failure === "integration") vi.spyOn(integrationGit, "integrate").mockImplementationOnce(() => { throw new Error("Git rejected result"); });
    else runner.withErrorForTask("A", new Error("Task failed"));
    const execution = new TaskScheduler({ gw, runner, config, stateRepo, promptService, reporter,
      recoveryCoordinator: fakeRecoveryCoordinator(stateRepo), worktreeLifecycle: fakeWorktreeLifecycle(stateRepo), taskResultGit: fakeTaskResultGit(), integrationGit });
    const result = await execution.run("test-intent");
    expect(result.status).toBe("failed");
    expect(runner.hasExecuted("B")).toBe(false);
    expect(runner.hasExecuted("D")).toBe(true);
    expect(stateRepo.load("test-intent")?.tasks.D.integration?.status).toBe("succeeded");
    expect(reporter.onDeadlock).not.toHaveBeenCalled();
  });

  it("reports dependency blocking instead of deadlock for completion without integration evidence", async () => {
    const tasks = [TaskBuilder.aTask().withId("A").build(),
      TaskBuilder.aTask().withId("B").withDependencies(["A"]).build()];
    for (const task of tasks) writeTask("test-intent", task);
    const state = stateRepo.init("test-intent", tasks);
    state.tasks.A.status = "completed";
    stateRepo.save(state);
    const result = await scheduler.run("test-intent");
    expect(result).toMatchObject({ status: "paused", reason: expect.stringContaining("integration evidence") });
    expect(runner.hasExecuted("B")).toBe(false);
    expect(reporter.onDeadlock).not.toHaveBeenCalled();
  });

  describe("streaming logs and status", () => {
    it("should pass onLog callback in TaskContext and forward chunk to reporter.onLog", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      runner.withHandler((context) => {
        context.onLog?.("chunk 1");
        context.onLog?.("chunk 2");
      });

      const result = await scheduler.run("test-intent");

      expect(result.status).toBe("completed");
      expect(reporter.onLog).toHaveBeenCalledWith("TASK-001", "chunk 1");
      expect(reporter.onLog).toHaveBeenCalledWith("TASK-001", "chunk 2");
    });

    it("should execute successfully even if reporter does not define onLog", async () => {
      delete reporter.onLog;
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-intent", task);

      runner.withHandler((context) => {
        context.onLog?.("chunk without reporter listener");
      });

      const result = await scheduler.run("test-intent");
      expect(result.status).toBe("completed");
    });

    it("should allow getting and setting reporter and tracking scheduler status", async () => {
      expect(scheduler.getStatus()).toBe("idle");
      expect(scheduler.getReporter()).toBe(reporter);

      const newReporter: SchedulerReporter = {
        onStart: vi.fn(),
        onComplete: vi.fn(),
        onFail: vi.fn(),
        onUpdate: vi.fn(),
        onError: vi.fn(),
        onDeadlock: vi.fn(),
      };
      scheduler.setReporter(newReporter);
      expect(scheduler.getReporter()).toBe(newReporter);
    });
  });
});


describe("TaskScheduler Git dependency bases", () => {
  it("starts dependents from integrated results while independent worktrees stay fixed", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "codeforge-scheduler-"));
    const command = (...args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: "pipe" }).trim();
    try {
      command("init", "-b", "main");
      command("config", "user.email", "test@example.com");
      command("config", "user.name", "Test");
      writeFileSync(path.join(directory, ".gitignore"), ".codeforge/\nnode_modules/\n");
      writeFileSync(path.join(directory, "package.json"), '{"name":"fixture","version":"1.0.0"}');
      writeFileSync(path.join(directory, "package-lock.json"), '{"lockfileVersion":3}');
      command("add", ".");
      command("commit", "-m", "base");
      const base = command("rev-parse", "HEAD");
      const gw = new NodeWorkspaceGateway(directory);
      const repo = new ExecutionStateRepository(gw);
      const git = new NodeGitGateway(directory);
      const lifecycle = new WorktreeLifecycle(git, new FakeProcessExecutor(), repo);
      const tasks = [TaskBuilder.aTask().withId("A").build(),
        TaskBuilder.aTask().withId("B").withDependencies(["A"]).build(),
        TaskBuilder.aTask().withId("C").build()];
      gw.mkdir(".codeforge/tasks/run");
      for (const task of tasks) gw.writeFile(".codeforge/tasks/run/" + task.id + ".json", JSON.stringify(task));
      const runner = new InMemoryAgentRunner();
      let releaseIndependent!: () => void;
      const dependentStarted = new Promise<void>(resolve => { releaseIndependent = resolve; });
      const checks: string[] = [];
      runner.withHandler(async context => {
        if (context.taskId === "B") {
          try {
            const state = repo.load("run")!;
            expect(state.tasks.A.integration?.status).toBe("succeeded");
            expect(state.tasks.B.baseCommit).toBe(state.tasks.A.integration?.acceptedCommit);
            expect(git.isAncestor(context.cwd!, state.tasks.A.resultCommit!, state.tasks.B.baseCommit!)).toBe(true);
            expect(readFileSync(path.join(context.cwd!, "A.txt"), "utf8")).toBe("A");
            checks.push("dependent");
          } finally { releaseIndependent(); }
        }
        if (context.taskId === "C") {
          const initial = repo.load("run")!.tasks.C;
          await dependentStarted;
          expect(repo.load("run")!.tasks.C.baseCommit).toBe(initial.baseCommit);
          expect(git.getRepositoryInfo(context.cwd!).head).toBe(base);
          expect(() => readFileSync(path.join(context.cwd!, "A.txt"))).toThrow();
          checks.push("independent");
        }
        writeFileSync(path.join(context.cwd!, context.taskId + ".txt"), context.taskId!);
      });
      const hooks = { dispatch: vi.fn(async () => []) };
      const scheduler = new TaskScheduler({ cwd: directory, gw, runner, stateRepo: repo,
        config: { environment: "test", plannerAgent: "test", executorAgent: "test", language: "en" },
        promptService: new PromptService(gw, directory), worktreeLifecycle: lifecycle,
        taskResultGit: git, integrationGit: git, hooks });
      expect((await scheduler.run("run")).status).toBe("completed");
      expect(checks).toEqual(["dependent", "independent"]);
      expect(hooks.dispatch.mock.calls.filter(([context]) => context.event === "task.verify")).toHaveLength(3);
      expect(repo.load("run")?.integrationOwner).toBeUndefined();
    } finally {
      // The exact temporary directory allocated above owns all fixture worktrees.
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30000);
});

describe("TaskScheduler review follow-up isolation", () => {
  it("prepares, verifies, commits and integrates reviewer tasks before guarded delivery", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "codeforge-review-"));
    const command = (...args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: "pipe" }).trim();
    try {
      command("init", "-b", "main");
      command("config", "user.email", "test@example.com");
      command("config", "user.name", "Test");
      writeFileSync(path.join(directory, ".gitignore"), ".codeforge/\nnode_modules/\n");
      writeFileSync(path.join(directory, "package.json"), '{"name":"fixture","version":"1.0.0"}');
      writeFileSync(path.join(directory, "package-lock.json"), '{"lockfileVersion":3}');
      command("add", ".");
      command("commit", "-m", "base");
      const base = command("rev-parse", "HEAD");
      const gw = new NodeWorkspaceGateway(directory);
      const repo = new ExecutionStateRepository(gw);
      const git = new NodeGitGateway(directory);
      const processes = new FakeProcessExecutor();
      const prepare = vi.spyOn(processes, "exec");
      const lifecycle = new WorktreeLifecycle(git, processes, repo);
      const initial = TaskBuilder.aTask().withId("TASK-001").build();
      const followUp = TaskBuilder.aTask().withId("TASK-002").withDependencies(["TASK-001"]).build();
      gw.mkdir(".codeforge/tasks/run");
      gw.writeFile(PATHS.metadata, "{}");
      gw.writeFile(PATHS.taskFile("run", initial.id), JSON.stringify(initial));
      const runner = new InMemoryAgentRunner();
      const reviewRunner = new InMemoryAgentRunner();
      const config: CodeForgeConfig = { environment: "test", plannerAgent: "test", executorAgent: "test", language: "en",
        aiReview: { enabled: true, maxRounds: 3 } };
      const promptService = new PromptService(gw, directory);
      let reviews = 0;
      reviewRunner.withHandler(context => {
        const state = repo.load("run")!;
        expect(context.cwd).toBe(state.integrationWorktreePath);
        expect(path.isAbsolute(context.promptFilePath!)).toBe(true);
        expect(git.getChangedFiles(directory)).toEqual([]);
        expect(command("rev-parse", "HEAD")).toBe(base);
        const prompt = readFileSync(context.promptFilePath!, "utf8");
        expect(prompt).toContain("Original base commit: " + base);
        expect(prompt).toContain("Accepted integration commit: " + state.lastAcceptedCommit);
        expect(prompt).toContain("### File: TASK-001.txt");
        expect(Object.values(state.tasks).every(task => task.integration?.status === "succeeded")).toBe(true);
        expect(state.integrationQueue).toEqual([]);
        if (++reviews === 1) gw.writeFile(PATHS.taskFile("run", followUp.id), JSON.stringify(followUp));
        else expect(prompt).toContain("### File: TASK-002.txt");
      });
      runner.withHandler(context => {
        if (context.taskId === followUp.id) {
          const state = repo.load("run")!;
          expect(state.tasks[followUp.id].baseCommit).toBe(state.tasks[initial.id].integration?.acceptedCommit);
          expect(readFileSync(path.join(context.cwd!, "TASK-001.txt"), "utf8")).toBe(initial.id);
        }
        writeFileSync(path.join(context.cwd!, context.taskId + ".txt"), context.taskId!);
      });
      const hooks = { dispatch: vi.fn(async (_context: HookContext) => []) };
      const scheduler = new TaskScheduler({ cwd: directory, gw, runner, config, stateRepo: repo,
        promptService, recoveryCoordinator: new ExecutionRecoveryCoordinator(repo, git, processes),
        worktreeLifecycle: lifecycle, taskResultGit: git, integrationGit: git, deliveryGit: git, hooks,
        reviewUseCase: new ExecuteReviewUseCase(gw, git, reviewRunner, promptService, config, directory),
        validatePlanUseCase: new ValidatePlanUseCase(gw) });
      expect(await scheduler.run("run")).toMatchObject({ status: "pending", newTasks: [followUp.id] });
      expect(repo.load("run")?.delivery?.deliveredCommit).toBeUndefined();
      expect(command("rev-parse", "HEAD")).toBe(base);
      expect(await scheduler.run("run")).toMatchObject({ status: "completed" });
      const state = repo.load("run")!;
      expect(state.tasks[followUp.id].branch).not.toBe(state.tasks[initial.id].branch);
      expect(state.tasks[followUp.id].worktreePath).not.toBe(state.tasks[initial.id].worktreePath);
      expect(state.tasks[followUp.id].integration?.status).toBe("succeeded");
      expect(git.isAncestor(directory, state.tasks[followUp.id].resultCommit!, state.lastAcceptedCommit!)).toBe(true);
      expect(command("rev-parse", "HEAD")).toBe(state.lastAcceptedCommit);
      expect(readFileSync(path.join(directory, "TASK-002.txt"), "utf8")).toBe(followUp.id);
      for (const task of Object.values(state.tasks)) {
        expect(prepare).toHaveBeenCalledWith("npm ci", expect.objectContaining({ cwd: task.worktreePath }));
        expect(hooks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ event: "task.verify", cwd: task.worktreePath }));
      }
      expect(hooks.dispatch.mock.calls.filter(([context]) => context.event === "task.verify")).toHaveLength(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60000);
});
