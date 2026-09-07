import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ReactiveTaskScheduler,
  TaskLogEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  RunStartedEvent,
  RunCompletedEvent,
  RunFailedEvent,
  RunDeadlockEvent,
} from "../../src/scheduler/ReactiveTaskScheduler.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { InMemoryAgentRunner } from "../helpers/in-memory-agent-runner.js";
import { TaskBuilder } from "../helpers/task-builder.js";
import { CodeForgeConfig } from "../../src/config/types.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../src/application/services/PromptService.js";
import { SchedulerReporter } from "../../src/application/ports/SchedulerReporter.js";
import { Task } from "../../src/domain/task.js";

describe("ReactiveTaskScheduler", () => {
  let gw: InMemoryWorkspaceGateway;
  let runner: InMemoryAgentRunner;
  let config: CodeForgeConfig;
  let stateRepo: ExecutionStateRepository;
  let promptService: PromptService;
  let reporter: SchedulerReporter;
  let scheduler: ReactiveTaskScheduler;

  beforeEach(() => {
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

    scheduler = new ReactiveTaskScheduler(
      gw,
      runner,
      config,
      stateRepo,
      promptService,
      reporter,
    );

    gw.mkdir(".codeforge/tasks/test-spec");
  });

  function writeTask(specName: string, task: Task): void {
    gw.mkdir(`.codeforge/tasks/${specName}`);
    gw.writeFile(
      `.codeforge/tasks/${specName}/${task.id}.json`,
      JSON.stringify(task),
    );
  }

  describe("Lifecycle Event Emission", () => {
    it("emits run:started, task:started, task:completed, and run:completed on successful run", async () => {
      const task1 = TaskBuilder.aTask()
        .withId("TASK-001")
        .withTitle("Task 1")
        .build();
      const task2 = TaskBuilder.aTask()
        .withId("TASK-002")
        .withTitle("Task 2")
        .withDependencies(["TASK-001"])
        .build();
      writeTask("test-spec", task1);
      writeTask("test-spec", task2);

      const runStartedSpy = vi.fn();
      const runCompletedSpy = vi.fn();
      const taskStartedSpy = vi.fn();
      const taskCompletedSpy = vi.fn();

      scheduler.on("run:started", runStartedSpy);
      scheduler.on("run:completed", runCompletedSpy);
      scheduler.on("task:started", taskStartedSpy);
      scheduler.on("task:completed", taskCompletedSpy);

      const result = await scheduler.run("test-spec");

      expect(result.status).toBe("completed");
      expect(scheduler.getStatus()).toBe("completed");

      expect(runStartedSpy).toHaveBeenCalledWith<[RunStartedEvent]>({
        specName: "test-spec",
      });
      expect(taskStartedSpy).toHaveBeenCalledWith<[TaskStartedEvent]>({
        specName: "test-spec",
        taskId: "TASK-001",
      });
      expect(taskCompletedSpy).toHaveBeenCalledWith<[TaskCompletedEvent]>({
        specName: "test-spec",
        taskId: "TASK-001",
      });
      expect(taskStartedSpy).toHaveBeenCalledWith<[TaskStartedEvent]>({
        specName: "test-spec",
        taskId: "TASK-002",
      });
      expect(taskCompletedSpy).toHaveBeenCalledWith<[TaskCompletedEvent]>({
        specName: "test-spec",
        taskId: "TASK-002",
      });
      expect(runCompletedSpy).toHaveBeenCalledWith<[RunCompletedEvent]>({
        specName: "test-spec",
      });
    });

    it("connects TaskContext.onLog to emit task:log events with task ID and log chunk", async () => {
      const task = TaskBuilder.aTask()
        .withId("TASK-001")
        .withTitle("Task with logs")
        .build();
      writeTask("test-spec", task);

      runner.withHandler((context) => {
        context.onLog?.("Starting execution...\n");
        context.onLog?.("Progress 50%\n");
        context.onLog?.("Done.\n");
      });

      const logEvents: TaskLogEvent[] = [];
      scheduler.on("task:log", (event) => {
        logEvents.push(event);
      });

      await scheduler.run("test-spec");

      expect(logEvents).toHaveLength(3);
      expect(logEvents[0]).toEqual<TaskLogEvent>({
        specName: "test-spec",
        taskId: "TASK-001",
        chunk: "Starting execution...\n",
      });
      expect(logEvents[1]).toEqual<TaskLogEvent>({
        specName: "test-spec",
        taskId: "TASK-001",
        chunk: "Progress 50%\n",
      });
      expect(logEvents[2]).toEqual<TaskLogEvent>({
        specName: "test-spec",
        taskId: "TASK-001",
        chunk: "Done.\n",
      });
    });

    it("emits task:failed and run:failed when a standalone task fails", async () => {
      const task = TaskBuilder.aTask()
        .withId("TASK-001")
        .withTitle("Failing task")
        .build();
      writeTask("test-spec", task);

      runner.withErrorForTask("TASK-001", "Build error: SyntaxError");

      const taskFailedSpy = vi.fn();
      const runFailedSpy = vi.fn();
      scheduler.on("task:failed", taskFailedSpy);
      scheduler.on("run:failed", runFailedSpy);

      const result = await scheduler.run("test-spec");

      expect(result.status).toBe("failed");
      expect(scheduler.getStatus()).toBe("failed");
      expect(taskFailedSpy).toHaveBeenCalledWith<[TaskFailedEvent]>({
        specName: "test-spec",
        taskId: "TASK-001",
        errors: ["Build error: SyntaxError"],
      });
      expect(runFailedSpy).toHaveBeenCalledWith<[RunFailedEvent]>({
        specName: "test-spec",
        reason: "One or more tasks failed.",
      });
    });

    it("emits task:failed and run:deadlock when a dependency fails leaving pending tasks blocked", async () => {
      const task1 = TaskBuilder.aTask()
        .withId("TASK-001")
        .withTitle("Root task")
        .build();
      const task2 = TaskBuilder.aTask()
        .withId("TASK-002")
        .withTitle("Blocked task")
        .withDependencies(["TASK-001"])
        .build();
      writeTask("test-spec", task1);
      writeTask("test-spec", task2);

      runner.withErrorForTask("TASK-001", "Root failed");

      const runDeadlockSpy = vi.fn();
      scheduler.on("run:deadlock", runDeadlockSpy);

      const result = await scheduler.run("test-spec");

      expect(result.status).toBe("deadlock");
      expect(scheduler.getStatus()).toBe("deadlock");
      expect(runDeadlockSpy).toHaveBeenCalledWith<[RunDeadlockEvent]>({
        specName: "test-spec",
      });

      const state = scheduler.getState("test-spec");
      expect(state?.tasks["TASK-001"].status).toBe("failed");
      expect(state?.tasks["TASK-002"].status).toBe("pending");
    });
  });

  describe("Interactive Commands", () => {
    it("allows retrying a failed task via retryTask and completes the run", async () => {
      const task1 = TaskBuilder.aTask()
        .withId("TASK-001")
        .withTitle("Task 1")
        .build();
      const task2 = TaskBuilder.aTask()
        .withId("TASK-002")
        .withTitle("Task 2")
        .withDependencies(["TASK-001"])
        .build();
      writeTask("test-spec", task1);
      writeTask("test-spec", task2);

      // First run: TASK-001 fails
      runner.withErrorForTask("TASK-001", "Temporary glitch");
      const firstResult = await scheduler.run("test-spec");
      expect(firstResult.status).toBe("deadlock");
      expect(scheduler.getStatus()).toBe("deadlock");

      // Fix runner and retry TASK-001
      runner.withSuccess();
      const runCompletedPromise = new Promise<void>((resolve) => {
        scheduler.once("run:completed", () => resolve());
      });

      await scheduler.retryTask("TASK-001");
      expect(scheduler.getStatus()).toBe("running");

      await runCompletedPromise;
      expect(scheduler.getStatus()).toBe("completed");

      const state = stateRepo.load("test-spec");
      expect(state?.status).toBe("completed");
      expect(state?.tasks["TASK-001"].status).toBe("completed");
      expect(state?.tasks["TASK-002"].status).toBe("completed");
      expect(state?.tasks["TASK-001"].errors).toBeUndefined();
    });

    it("allows retrying all failed tasks via retryAllFailed", async () => {
      const task1 = TaskBuilder.aTask().withId("TASK-001").build();
      const task2 = TaskBuilder.aTask().withId("TASK-002").build();
      writeTask("test-spec", task1);
      writeTask("test-spec", task2);

      runner.withErrorForTask("TASK-001", "Fail 1");
      runner.withErrorForTask("TASK-002", "Fail 2");

      const firstResult = await scheduler.run("test-spec");
      expect(firstResult.status).toBe("failed");

      runner.withSuccess();

      const runCompletedPromise = new Promise<void>((resolve) => {
        scheduler.once("run:completed", () => resolve());
      });

      await scheduler.retryAllFailed();
      expect(scheduler.getStatus()).toBe("running");

      await runCompletedPromise;
      expect(scheduler.getStatus()).toBe("completed");
    });

    it("allows manually completing a task via completeTask and unblocks dependent tasks", async () => {
      const task1 = TaskBuilder.aTask().withId("TASK-001").build();
      const task2 = TaskBuilder.aTask()
        .withId("TASK-002")
        .withDependencies(["TASK-001"])
        .build();
      writeTask("test-spec", task1);
      writeTask("test-spec", task2);

      runner.withErrorForTask("TASK-001", "Manual task required");

      const result = await scheduler.run("test-spec");
      expect(result.status).toBe("deadlock");

      const runCompletedPromise = new Promise<void>((resolve) => {
        scheduler.once("run:completed", () => resolve());
      });

      // User manually marks TASK-001 completed
      await scheduler.completeTask("TASK-001");

      await runCompletedPromise;
      expect(scheduler.getStatus()).toBe("completed");

      const state = stateRepo.load("test-spec");
      expect(state?.tasks["TASK-001"].status).toBe("completed");
      expect(state?.tasks["TASK-002"].status).toBe("completed");
    });

    it("allows resetting a task to pending state via resetTask", async () => {
      const task1 = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task1);

      await scheduler.run("test-spec");
      expect(scheduler.getStatus()).toBe("completed");

      let executionCount = 0;
      runner.withHandler(() => {
        executionCount++;
      });

      const taskCompletedPromise = new Promise<void>((resolve) => {
        scheduler.once("task:completed", () => resolve());
      });

      await scheduler.resetTask("TASK-001");
      await taskCompletedPromise;

      expect(executionCount).toBe(1);
    });

    it("supports command dispatch via dispatchCommand and command events", async () => {
      const task1 = TaskBuilder.aTask().withId("TASK-001").build();
      writeTask("test-spec", task1);

      runner.withErrorForTask("TASK-001", "fail");
      await scheduler.run("test-spec");
      expect(scheduler.getStatus()).toBe("failed");

      runner.withSuccess();

      const runCompletedPromise = new Promise<void>((resolve) => {
        scheduler.once("run:completed", () => resolve());
      });

      await scheduler.dispatchCommand({
        type: "RETRY_TASK",
        taskId: "TASK-001",
      });

      await runCompletedPromise;
      expect(scheduler.getStatus()).toBe("completed");
    });
  });

  describe("Non-blocking and State Persistence", () => {
    it("keeps state loaded and inspectable after deadlock or failure without throwing", async () => {
      const task = TaskBuilder.aTask()
        .withId("TASK-001")
        .withTitle("Error task")
        .build();
      writeTask("test-spec", task);

      runner.withError("Fatal executor crash");

      const result = await scheduler.run("test-spec");

      expect(result.status).toBe("failed");
      expect(scheduler.getStatus()).toBe("failed");

      const persistedState = stateRepo.load("test-spec");
      expect(persistedState).not.toBeNull();
      expect(persistedState?.status).toBe("failed");
      expect(persistedState?.tasks["TASK-001"].status).toBe("failed");
      expect(persistedState?.tasks["TASK-001"].errors).toContain(
        "Fatal executor crash",
      );

      // Tasks can still be retrieved
      expect(scheduler.getTasks()).toHaveLength(1);
      expect(scheduler.getState()?.tasks["TASK-001"].status).toBe("failed");
    });
  });
});
