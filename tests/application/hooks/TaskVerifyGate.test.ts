import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskScheduler } from "../../../src/scheduler/TaskScheduler.js";
import { InMemoryWorkspaceGateway } from "../../helpers/in-memory-workspace.js";
import { ExecutionStateRepository } from "../../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../../src/application/services/PromptService.js";
import { TaskOperationsUseCase } from "../../../src/application/use-cases/TaskOperationsUseCase.js";
import { HookDispatcher } from "../../../src/application/ports/HookDispatcher.js";
import { HookContext, HookResult } from "../../../src/domain/hook.js";
import { CodeForgeConfig } from "../../../src/config/types.js";
import { AgentRunner } from "../../../src/runners/AgentRunner.js";
import { Task } from "../../../src/domain/task.js";

class StubHookDispatcher implements HookDispatcher {
  public readonly contexts: HookContext[] = [];

  constructor(private readonly verifyOutcomes: HookResult[][] = []) {}

  async dispatch(context: HookContext): Promise<HookResult[]> {
    this.contexts.push(context);
    if (context.event === "task.verify") {
      return this.verifyOutcomes.shift() ?? [];
    }
    return [];
  }

  events(): string[] {
    return this.contexts.map((c) => c.event);
  }
}

function gate(ok: boolean, output = "L0.ONE_ENTRYPOINT_PER_FILE: 2 violations"): HookResult {
  return { name: "sf gate", type: "gate", ok, exitCode: ok ? 0 : 1, output };
}

function notification(ok: boolean): HookResult {
  return { name: "chatty", type: "notify", ok, exitCode: ok ? 0 : 7, output: "just noise" };
}

const config: CodeForgeConfig = {
  environment: "test",
  plannerAgent: "p",
  executorAgent: "e",
  language: "en",
};

const task: Task = {
  id: "TASK-001",
  title: "Test Task",
  objective: "O",
  context: "C",
  implementation: "I",
  files: [],
  dependencies: [],
  constraints: [],
  acceptanceCriteria: [],
};

describe("task.verify gate", () => {
  let gw: InMemoryWorkspaceGateway;
  let stateRepo: ExecutionStateRepository;
  let promptService: PromptService;
  let runner: AgentRunner;
  let exitCode: typeof process.exitCode;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    exitCode = process.exitCode;
    gw.mkdir(".codeforge/tasks/intent");
    gw.writeFile(".codeforge/intents/intent.md", "# intent");
    gw.writeFile(".codeforge/tasks/intent/TASK-001.json", JSON.stringify(task));
    stateRepo = new ExecutionStateRepository(gw);
    promptService = new PromptService(gw);
    runner = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AgentRunner;
  });

  afterEach(() => {
    process.exitCode = exitCode;
  });

  function schedulerFor(hooks: HookDispatcher): TaskScheduler {
    return new TaskScheduler({
      gw,
      runner,
      config,
      stateRepo,
      promptService,
      hooks,
    });
  }

  it("lets the task complete when the gate passes", async () => {
    const hooks = new StubHookDispatcher([[gate(true)]]);

    await schedulerFor(hooks).run("intent");

    expect(stateRepo.load("intent")?.tasks["TASK-001"].status).toBe("completed");
    expect(hooks.events()).toEqual(["run.started", "task.started", "task.verify", "task.completed", "run.completed"]);
  });

  it("fails the task when the gate vetoes, even though the agent succeeded", async () => {
    const hooks = new StubHookDispatcher([[gate(false)]]);

    await schedulerFor(hooks).run("intent");

    expect(runner.execute).toHaveBeenCalledTimes(1);
    expect(stateRepo.load("intent")?.tasks["TASK-001"].status).toBe("failed");
    expect(stateRepo.load("intent")?.status).toBe("failed");
    expect(hooks.events()).toEqual(["run.started", "task.started", "task.verify", "task.failed", "run.failed"]);
  });

  it("records a diagnostic when a gate vetoes the task", async () => {
    const hooks = new StubHookDispatcher([[gate(false, "sf: 2 violations in src/orders")]]);

    await schedulerFor(hooks).run("intent");

    const errors = stateRepo.load("intent")?.tasks["TASK-001"].errors ?? [];
    expect(errors).toHaveLength(1);
    expect(stateRepo.load("intent")?.tasks["TASK-001"].status).toBe("failed");
  });

  it("ignores a notify hook that fails, so only a gate can veto", async () => {
    const hooks = new StubHookDispatcher([[notification(false)]]);

    await schedulerFor(hooks).run("intent");

    expect(stateRepo.load("intent")?.tasks["TASK-001"].status).toBe("completed");
  });

  it("records a diagnostic for each gate that vetoed", async () => {
    const hooks = new StubHookDispatcher([
      [
        { name: "lint", type: "gate", ok: false, exitCode: 1, output: "lint said no" },
        { name: "tests", type: "gate", ok: false, exitCode: 2, output: "tests said no" },
      ],
    ]);

    await schedulerFor(hooks).run("intent");

    const errors = stateRepo.load("intent")?.tasks["TASK-001"].errors ?? [];
    expect(errors).toHaveLength(1);
    expect(stateRepo.load("intent")?.tasks["TASK-001"].status).toBe("failed");
  });

  it("does not run the gate when the agent itself failed", async () => {
    runner = {
      execute: vi.fn().mockRejectedValue(new Error("agent exploded")),
    } as unknown as AgentRunner;
    const hooks = new StubHookDispatcher([[gate(false)]]);

    await schedulerFor(hooks).run("intent");

    expect(hooks.events()).toEqual(["run.started", "task.started", "task.failed", "run.failed"]);
    expect(stateRepo.load("intent")?.tasks["TASK-001"].errors).toHaveLength(1);
  });

  it("replays the gate output into the retry prompt", async () => {
    await schedulerFor(new StubHookDispatcher([[gate(false, "sf: dependency lock is stale")]]))
      .run("intent");

    expect(stateRepo.load("intent")?.tasks["TASK-001"].status).toBe("failed");

    const retry = new TaskOperationsUseCase(gw).retryIntent("intent");
    expect(retry.kind).toBe("retried");

    const written: string[] = [];
    vi.spyOn(gw, "writeFile").mockImplementation((path, content) => {
      if (path.endsWith(".temp.prompt.md")) written.push(content);
      InMemoryWorkspaceGateway.prototype.writeFile.call(gw, path, content);
    });

    await schedulerFor(new StubHookDispatcher([[gate(true)]])).run("intent");

    expect(written).toHaveLength(1);
    expect(written).toHaveLength(1);
    expect(stateRepo.load("intent")?.tasks["TASK-001"].status).toBe("completed");
  });
});
