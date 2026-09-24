import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskScheduler } from "../../../src/scheduler/TaskScheduler.js";
import { InMemoryWorkspaceGateway } from "../../helpers/in-memory-workspace.js";
import { ExecutionStateRepository } from "../../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../../src/application/services/PromptService.js";
import { HookDispatcher } from "../../../src/application/ports/HookDispatcher.js";
import { HookContext, HookResult } from "../../../src/domain/hook.js";
import { HOOK_EVENTS } from "../../../src/domain/hook.js";
import { CodeForgeConfig } from "../../../src/config/types.js";
import { AgentRunner } from "../../../src/runners/AgentRunner.js";
import { Task } from "../../../src/domain/task.js";

class RecordingHookDispatcher implements HookDispatcher {
  public readonly contexts: HookContext[] = [];

  async dispatch(context: HookContext): Promise<HookResult[]> {
    this.contexts.push(context);
    return [];
  }

  events(): string[] {
    return this.contexts.map((c) => c.event);
  }
}

const config: CodeForgeConfig = {
  environment: "test",
  plannerAgent: "p",
  executorAgent: "e",
  language: "en",
};

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "TASK-001",
    title: "Test Task",
    objective: "O",
    context: "C",
    implementation: "I",
    files: [],
    dependencies: [],
    constraints: [],
    acceptanceCriteria: [],
    ...overrides,
  };
}

describe("TaskScheduler hook dispatch", () => {
  let gw: InMemoryWorkspaceGateway;
  let hooks: RecordingHookDispatcher;
  let exitCode: typeof process.exitCode;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    hooks = new RecordingHookDispatcher();
    exitCode = process.exitCode;
    gw.mkdir(".codeforge/tasks/intent");
    gw.writeFile(".codeforge/intents/intent.md", "# intent");
  });

  afterEach(() => {
    process.exitCode = exitCode;
  });

  it("exposes AI review lifecycle events and review result metadata", () => {
    expect(HOOK_EVENTS).toContain("review.started");
    expect(HOOK_EVENTS).toContain("review.completed");

    const context: HookContext = {
      event: "review.completed",
      intentName: "intent",
      reviewResult: {
        outcome: "tasks_created",
        newTasksCount: 1,
        taskIds: ["TASK-002"],
      },
    };

    expect(context.reviewResult?.taskIds).toEqual(["TASK-002"]);
  });

  it("does not start AI review when an already completed intent is opened again", async () => {
    const task = taskFixture();
    writeTask(task);
    const repository = new ExecutionStateRepository(gw);
    const state = repository.init("intent", [task]);
    state.tasks[task.id].status = "completed";
    state.status = "completed";
    repository.save(state);
    const runner = { execute: vi.fn() } as unknown as AgentRunner;
    const scheduler = new TaskScheduler({
      gw,
      runner,
      config: { ...config, aiReview: { enabled: true, agent: "default", maxRounds: 3 } },
      stateRepo: repository,
      promptService: new PromptService(gw),
      hooks,
    });

    const result = await scheduler.run("intent");

    expect(result.status).toBe("completed");
    expect(runner.execute).not.toHaveBeenCalled();
    expect(hooks.events()).not.toContain("review.started");
  });

  function schedulerFor(runner: AgentRunner, withHooks = true): TaskScheduler {
    return new TaskScheduler({
      gw,
      runner,
      config,
      stateRepo: new ExecutionStateRepository(gw),
      promptService: new PromptService(gw),
      hooks: withHooks ? hooks : undefined,
    });
  }

  function writeTask(task: Task): void {
    gw.writeFile(`.codeforge/tasks/intent/${task.id}.json`, JSON.stringify(task));
  }

  it("announces the run and the task around a successful execution", async () => {
    writeTask(taskFixture());
    const runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;

    await schedulerFor(runner).run("intent");

    expect(hooks.events()).toEqual([
      "run.started",
      "task.started",
      "task.verify",
      "task.completed",
      "run.completed",
    ]);
  });

  it("names the intent and the task on every context", async () => {
    writeTask(taskFixture());
    const runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;

    await schedulerFor(runner).run("intent");

    const started = hooks.contexts.find((c) => c.event === "task.started");
    expect(started).toEqual({ event: "task.started", intentName: "intent", taskId: "TASK-001" });
    expect(started?.intentName).toBe("intent");
    const runStarted = hooks.contexts.find((c) => c.event === "run.started");
    expect(runStarted).toEqual({
      event: "run.started",
      intentName: "intent",
    });
    expect(runStarted?.intentName).toBe("intent");
  });

  it("reports a failed task with the diagnostics that were recorded for it", async () => {
    writeTask(taskFixture());
    const runner = {
      execute: vi.fn().mockRejectedValue(new Error("agent exploded")),
    } as unknown as AgentRunner;

    await schedulerFor(runner).run("intent");

    expect(hooks.events()).toEqual([
      "run.started",
      "task.started",
      "task.failed",
      "run.failed",
    ]);
    expect(hooks.contexts.find((c) => c.event === "task.failed")?.errors).toEqual([
      "agent exploded",
    ]);
  });

  it("reports a deadlock when a dependency can never complete", async () => {
    writeTask(taskFixture({ dependencies: ["TASK-999"] }));
    const runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;

    await schedulerFor(runner).run("intent");

    expect(hooks.events()).toEqual(["run.started", "run.deadlock"]);
    expect(runner.execute).not.toHaveBeenCalled();
  });

  it("announces each task of a dependency chain in order", async () => {
    writeTask(taskFixture({ id: "TASK-001" }));
    writeTask(taskFixture({ id: "TASK-002", dependencies: ["TASK-001"] }));
    const runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;

    await schedulerFor(runner).run("intent");

    expect(hooks.contexts.filter((c) => c.event === "task.completed").map((c) => c.taskId))
      .toEqual(["TASK-001", "TASK-002"]);
  });

  it("runs unchanged when no dispatcher is supplied", async () => {
    writeTask(taskFixture());
    const runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;

    await schedulerFor(runner, false).run("intent");

    expect(runner.execute).toHaveBeenCalledTimes(1);
    expect(hooks.contexts).toEqual([]);
    expect(new ExecutionStateRepository(gw).load("intent")?.status).toBe("completed");
  });

  it("configures hook reporter on injected hook dispatcher", () => {
    const runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;
    const mockDispatcher: HookDispatcher = {
      dispatch: vi.fn().mockResolvedValue([]),
      setReporter: vi.fn(),
    };
    const scheduler = new TaskScheduler({
      gw,
      runner,
      config,
      stateRepo: new ExecutionStateRepository(gw),
      promptService: new PromptService(gw),
      hooks: mockDispatcher,
    });

    const mockHookReporter = { onHookStart: vi.fn(), onHookEnd: vi.fn() };
    scheduler.setHookReporter(mockHookReporter);

    expect(mockDispatcher.setReporter).toHaveBeenCalledWith(mockHookReporter);
    expect(scheduler.getHookReporter()).toBe(mockHookReporter);
  });
});
