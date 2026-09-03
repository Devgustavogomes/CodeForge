import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskScheduler } from "../../../src/scheduler/TaskScheduler.js";
import { InMemoryWorkspaceGateway } from "../../helpers/in-memory-workspace.js";
import { ExecutionStateRepository } from "../../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../../src/application/services/PromptService.js";
import { HookDispatcher } from "../../../src/application/ports/HookDispatcher.js";
import { HookContext, HookResult } from "../../../src/domain/hook.js";
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
  let exitCode: number | string | undefined;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    hooks = new RecordingHookDispatcher();
    exitCode = process.exitCode;
    gw.mkdir(".codeforge/tasks/spec");
    gw.writeFile(".codeforge/specs/spec.md", "# spec");
  });

  afterEach(() => {
    process.exitCode = exitCode;
  });

  function schedulerFor(runner: AgentRunner, withHooks = true): TaskScheduler {
    return new TaskScheduler(
      gw,
      runner,
      config,
      new ExecutionStateRepository(gw),
      new PromptService(gw),
      undefined,
      withHooks ? hooks : undefined,
    );
  }

  function writeTask(task: Task): void {
    gw.writeFile(`.codeforge/tasks/spec/${task.id}.json`, JSON.stringify(task));
  }

  it("announces the run and the task around a successful execution", async () => {
    writeTask(taskFixture());
    const runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;

    await schedulerFor(runner).run("spec");

    expect(hooks.events()).toEqual([
      "run.started",
      "task.started",
      "task.completed",
      "run.completed",
    ]);
  });

  it("names the spec and the task on every context", async () => {
    writeTask(taskFixture());
    const runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;

    await schedulerFor(runner).run("spec");

    const started = hooks.contexts.find((c) => c.event === "task.started");
    expect(started).toEqual({ event: "task.started", specName: "spec", taskId: "TASK-001" });
    expect(hooks.contexts.find((c) => c.event === "run.started")).toEqual({
      event: "run.started",
      specName: "spec",
    });
  });

  it("reports a failed task with the diagnostics that were recorded for it", async () => {
    writeTask(taskFixture());
    const runner = {
      execute: vi.fn().mockRejectedValue(new Error("agent exploded")),
    } as unknown as AgentRunner;

    await schedulerFor(runner).run("spec");

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

    await schedulerFor(runner).run("spec");

    expect(hooks.events()).toEqual(["run.started", "run.deadlock"]);
    expect(runner.execute).not.toHaveBeenCalled();
  });

  it("announces each task of a dependency chain in order", async () => {
    writeTask(taskFixture({ id: "TASK-001" }));
    writeTask(taskFixture({ id: "TASK-002", dependencies: ["TASK-001"] }));
    const runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;

    await schedulerFor(runner).run("spec");

    expect(hooks.contexts.filter((c) => c.event === "task.completed").map((c) => c.taskId))
      .toEqual(["TASK-001", "TASK-002"]);
  });

  it("runs unchanged when no dispatcher is supplied", async () => {
    writeTask(taskFixture());
    const runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;

    await schedulerFor(runner, false).run("spec");

    expect(runner.execute).toHaveBeenCalledTimes(1);
    expect(hooks.contexts).toEqual([]);
    expect(new ExecutionStateRepository(gw).load("spec")?.status).toBe("completed");
  });
});
