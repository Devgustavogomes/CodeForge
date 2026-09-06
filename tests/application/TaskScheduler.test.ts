import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskScheduler, SchedulerRunResult } from "../../src/scheduler/TaskScheduler.js";
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
import { SpecExecutionState } from "../../src/domain/execution.js";

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
      onStart: vi.fn(),
      onComplete: vi.fn(),
      onFail: vi.fn(),
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onDeadlock: vi.fn(),
    };

    scheduler = new TaskScheduler(
      gw,
      runner,
      config,
      stateRepo,
      promptService,
      reporter,
    );

    gw.mkdir(".codeforge/tasks/test-spec");
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  function writeTask(specName: string, task: Task): void {
    gw.mkdir(`.codeforge/tasks/${specName}`);
    gw.writeFile(`.codeforge/tasks/${specName}/${task.id}.json`, JSON.stringify(task));
  }

  describe("SchedulerRunResult and exit code purity", () => {
    it("should return failed and not mutate process.exitCode if no tasks are found", async () => {
      const result = await scheduler.run("test-spec");

      expect(result).toEqual<SchedulerRunResult>({
        status: "failed",
        specName: "test-spec",
        reason: "No tasks found for spec: test-spec",
      });
      expect(reporter.onError).toHaveBeenCalledWith(expect.any(Error));
      expect(process.exitCode).toBeUndefined();
    });

    it("should return completed and not mutate process.exitCode on successful run", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").withTitle("Task 1").build();
      writeTask("test-spec", task);

      const result = await scheduler.run("test-spec");

      expect(result).toEqual<SchedulerRunResult>({
        status: "completed",
        specName: "test-spec",
      });
      expect(process.exitCode).toBeUndefined();
      expect(reporter.onComplete).toHaveBeenCalledWith("test-spec");

      const finalState = stateRepo.load("test-spec");
      expect(finalState?.status).toBe("completed");
      expect(finalState?.tasks["TASK-001"].status).toBe("completed");
      expect(runner.hasExecuted("TASK-001")).toBe(true);
    });

    it("should return failed and not mutate process.exitCode when a task fails", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      runner.withErrorForTask("TASK-001", new Error("Agent failed"));

      const result = await scheduler.run("test-spec");

      expect(result).toEqual<SchedulerRunResult>({
        status: "failed",
        specName: "test-spec",
        reason: "One or more tasks failed.",
      });
      expect(process.exitCode).toBeUndefined();
      expect(reporter.onFail).toHaveBeenCalledWith("test-spec");

      const finalState = stateRepo.load("test-spec");
      expect(finalState?.status).toBe("failed");
      expect(finalState?.tasks["TASK-001"].status).toBe("failed");
      expect(finalState?.tasks["TASK-001"].errors).toEqual(["Agent failed"]);
    });

    it("should return deadlock and not mutate process.exitCode when circular dependency occurs", async () => {
      const task1 = TaskBuilder.aTask().withId("TASK-001").withDependencies(["TASK-002"]).build();
      const task2 = TaskBuilder.aTask().withId("TASK-002").withDependencies(["TASK-001"]).build();
      writeTask("test-spec", task1);
      writeTask("test-spec", task2);

      const result = await scheduler.run("test-spec");

      expect(result).toEqual<SchedulerRunResult>({
        status: "deadlock",
        specName: "test-spec",
      });
      expect(process.exitCode).toBeUndefined();
      expect(reporter.onDeadlock).toHaveBeenCalledWith("test-spec");

      const finalState = stateRepo.load("test-spec");
      expect(finalState?.status).toBe("failed");
    });
  });

  describe("state transitions", () => {
    it("should transition tasks from pending to running to completed", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      let observedRunningState: string | undefined;
      runner.withHandler(async (context) => {
        const midState = stateRepo.load("test-spec");
        observedRunningState = context.taskId ? midState?.tasks[context.taskId]?.status : undefined;
      });

      const result = await scheduler.run("test-spec");

      expect(observedRunningState).toBe("running");
      expect(result.status).toBe("completed");

      const finalState = stateRepo.load("test-spec");
      expect(finalState?.tasks["TASK-001"].status).toBe("completed");
      expect(finalState?.tasks["TASK-001"].startedAt).toBeDefined();
      expect(finalState?.tasks["TASK-001"].completedAt).toBeDefined();
    });

    it("should transition tasks from pending to running to failed on runner error", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      let observedRunningState: string | undefined;
      runner.withHandler(async (context) => {
        const midState = stateRepo.load("test-spec");
        observedRunningState = context.taskId ? midState?.tasks[context.taskId]?.status : undefined;
        throw new Error("Execution exploded");
      });

      const result = await scheduler.run("test-spec");

      expect(observedRunningState).toBe("running");
      expect(result.status).toBe("failed");

      const finalState = stateRepo.load("test-spec");
      expect(finalState?.tasks["TASK-001"].status).toBe("failed");
      expect(finalState?.tasks["TASK-001"].errors).toEqual(["Execution exploded"]);
    });

    it("should return immediately if state is already completed", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      const existingState: SpecExecutionState = {
        specId: "test-spec",
        status: "completed",
        updatedAt: new Date().toISOString(),
        tasks: {
          "TASK-001": { status: "completed", dependencies: [] },
        },
      };
      stateRepo.save(existingState);

      const result = await scheduler.run("test-spec");

      expect(result).toEqual<SchedulerRunResult>({
        status: "completed",
        specName: "test-spec",
      });
      expect(reporter.onComplete).toHaveBeenCalledWith("test-spec");
      expect(runner.executedContexts).toHaveLength(0);
    });

    it("should fail immediately if previous state has no pending tasks and has failed tasks", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      const existingState: SpecExecutionState = {
        specId: "test-spec",
        status: "failed",
        updatedAt: new Date().toISOString(),
        tasks: {
          "TASK-001": { status: "failed", dependencies: [] },
        },
      };
      stateRepo.save(existingState);

      const result = await scheduler.run("test-spec");

      expect(result).toEqual<SchedulerRunResult>({
        status: "failed",
        specName: "test-spec",
        reason: "Spec execution has failed tasks.",
      });
      expect(runner.executedContexts).toHaveLength(0);
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe("gate hook verification handling", () => {
    it("should complete task and scheduler when gate hook passes", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      const hooks = new StubHookDispatcher([
        { name: "lint", type: "gate", ok: true, exitCode: 0, output: "clean" },
      ]);
      const schedulerWithHooks = new TaskScheduler(
        gw,
        runner,
        config,
        stateRepo,
        promptService,
        reporter,
        hooks,
      );

      const result = await schedulerWithHooks.run("test-spec");

      expect(result.status).toBe("completed");
      expect(stateRepo.load("test-spec")?.tasks["TASK-001"].status).toBe("completed");
      expect(process.exitCode).toBeUndefined();
    });

    it("should fail task and scheduler when gate hook fails", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      const hooks = new StubHookDispatcher([
        { name: "unit-tests", type: "gate", ok: false, exitCode: 1, output: "1 test failed" },
      ]);
      const schedulerWithHooks = new TaskScheduler(
        gw,
        runner,
        config,
        stateRepo,
        promptService,
        reporter,
        hooks,
      );

      const result = await schedulerWithHooks.run("test-spec");

      expect(result.status).toBe("failed");
      const finalTask = stateRepo.load("test-spec")?.tasks["TASK-001"];
      expect(finalTask?.status).toBe("failed");
      expect(finalTask?.errors?.[0]).toContain('Gate hook "unit-tests" failed with exit code 1');
      expect(finalTask?.errors?.[0]).toContain("1 test failed");
      expect(process.exitCode).toBeUndefined();
    });

    it("should not veto task when notify hook exits non-zero", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      const hooks = new StubHookDispatcher([
        { name: "slack-notify", type: "notify", ok: false, exitCode: 2, output: "network error" },
      ]);
      const schedulerWithHooks = new TaskScheduler(
        gw,
        runner,
        config,
        stateRepo,
        promptService,
        reporter,
        hooks,
      );

      const result = await schedulerWithHooks.run("test-spec");

      expect(result.status).toBe("completed");
      expect(stateRepo.load("test-spec")?.tasks["TASK-001"].status).toBe("completed");
    });
  });

  describe("DAG execution ordering and error diagnostics", () => {
    it("should run dependent task as soon as dependency completes without waiting for slow parallel task", async () => {
      const taskA = TaskBuilder.aTask().withId("TASK-A").build();
      const taskB = TaskBuilder.aTask().withId("TASK-B").build();
      const taskC = TaskBuilder.aTask().withId("TASK-C").withDependencies(["TASK-B"]).build();

      writeTask("test-spec", taskA);
      writeTask("test-spec", taskB);
      writeTask("test-spec", taskC);

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

      const result = await scheduler.run("test-spec");

      expect(result.status).toBe("completed");
      expect(taskCStartedBeforeTaskAFinished).toBe(true);

      const finalState = stateRepo.load("test-spec");
      expect(finalState?.tasks["TASK-A"].status).toBe("completed");
      expect(finalState?.tasks["TASK-B"].status).toBe("completed");
      expect(finalState?.tasks["TASK-C"].status).toBe("completed");
    });

    it("should pass previousErrors to promptService.createPromptFile when task has previous errors in state", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      const initialState = stateRepo.init("test-spec", [task]);
      initialState.tasks["TASK-001"].errors = [
        "Prior failure: build error",
        "Prior failure: test failed",
      ];
      stateRepo.save(initialState);

      const createPromptSpy = vi.spyOn(promptService, "createPromptFile");

      const result = await scheduler.run("test-spec");

      expect(result.status).toBe("completed");
      expect(createPromptSpy).toHaveBeenCalledWith(
        "test-spec",
        expect.objectContaining({ id: "TASK-001" }),
        "en",
        ["Prior failure: build error", "Prior failure: test failed"],
      );
    });

    it("should remove errors property from task state upon successful execution", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      const initialState = stateRepo.init("test-spec", [task]);
      initialState.tasks["TASK-001"].errors = ["Previous error to be cleared"];
      stateRepo.save(initialState);

      const result = await scheduler.run("test-spec");

      expect(result.status).toBe("completed");
      const finalTask = stateRepo.load("test-spec")?.tasks["TASK-001"];
      expect(finalTask?.status).toBe("completed");
      expect(finalTask?.errors).toBeUndefined();
      expect("errors" in (finalTask ?? {})).toBe(false);
    });

    it("should accumulate errors in task state and mark task as failed when execution fails", async () => {
      const task = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task);

      const initialState = stateRepo.init("test-spec", [task]);
      initialState.tasks["TASK-001"].errors = ["First error"];
      stateRepo.save(initialState);

      runner.withErrorForTask("TASK-001", new Error("Second error occurred"));

      const result = await scheduler.run("test-spec");

      expect(result.status).toBe("failed");
      const finalTask = stateRepo.load("test-spec")?.tasks["TASK-001"];
      expect(finalTask?.status).toBe("failed");
      expect(finalTask?.errors).toEqual(["First error", "Second error occurred"]);
      expect(reporter.onFail).toHaveBeenCalledWith("test-spec");
      expect(process.exitCode).toBeUndefined();
    });
  });
});
