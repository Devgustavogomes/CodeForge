import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskScheduler } from "../../src/scheduler/TaskScheduler.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { AgentRunner } from "../../src/runners/AgentRunner.js";
import { CodeForgeConfig } from "../../src/config/types.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../src/application/services/PromptService.js";
import { SchedulerReporter } from "../../src/application/ports/SchedulerReporter.js";
import { Task } from "../../src/domain/task.js";
import { SpecExecutionState } from "../../src/domain/execution.js";

describe("TaskScheduler", () => {
  let gw: InMemoryWorkspaceGateway;
  let runner: AgentRunner;
  let config: CodeForgeConfig;
  let stateRepo: ExecutionStateRepository;
  let promptService: PromptService;
  let reporter: SchedulerReporter;
  let scheduler: TaskScheduler;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    runner = { execute: vi.fn().mockResolvedValue(undefined) } as any;
    config = { environment: "test", plannerAgent: "p", executorAgent: "e", language: "en" } as any;
    stateRepo = {
      load: vi.fn(),
      init: vi.fn(),
      save: vi.fn(),
    } as any;
    promptService = {
      createPromptFile: vi.fn().mockReturnValue("prompt.md"),
      deletePromptFile: vi.fn(),
    } as any;
    reporter = {
      onStart: vi.fn(),
      onComplete: vi.fn(),
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onDeadlock: vi.fn(),
    };

    scheduler = new TaskScheduler(gw, runner, config, stateRepo as any, promptService as any, reporter);

    gw.mkdir(".codeforge/tasks/test-spec");
  });

  it("should stop if no tasks are found", async () => {
    await scheduler.run("test-spec");
    expect(reporter.onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should initialize state if it does not exist and execute tasks", async () => {
    const task: Task = {
      id: "TASK-001",
      title: "Test Task",
      objective: "O",
      context: "C",
      implementation: "I",
      files: [],
      dependencies: [],
      constraints: [],
      acceptanceCriteria: []
    };
    gw.writeFile(`.codeforge/tasks/test-spec/TASK-001.json`, JSON.stringify(task));

    const mockState: SpecExecutionState = {
      specId: "test-spec",
      status: "pending",
      updatedAt: new Date().toISOString(),
      tasks: {
        "TASK-001": { status: "pending", dependencies: [] }
      }
    };

    let callCount = 0;
    (stateRepo.load as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return null; // Initial check
      if (callCount === 2) return mockState; // First loop
      if (callCount >= 3) {
        mockState.status = "completed";
        mockState.tasks["TASK-001"].status = "completed";
        return mockState;
      }
    });

    (stateRepo.init as any).mockReturnValue(mockState);

    await scheduler.run("test-spec");

    expect(stateRepo.init).toHaveBeenCalledWith("test-spec", [task]);
    expect(stateRepo.save).toHaveBeenCalled();
    expect(promptService.createPromptFile).toHaveBeenCalledWith("test-spec", task, "en");
    expect(runner.execute).toHaveBeenCalled();
    expect(promptService.deletePromptFile).toHaveBeenCalledWith("prompt.md");
  });

  it("should return immediately if state is already completed", async () => {
    const task: Task = { id: "TASK-001", dependencies: [] } as any;
    gw.writeFile(`.codeforge/tasks/test-spec/TASK-001.json`, JSON.stringify(task));

    const mockState: SpecExecutionState = {
      specId: "test-spec",
      status: "completed",
      updatedAt: new Date().toISOString(),
      tasks: {}
    };

    (stateRepo.load as any).mockReturnValue(mockState);

    await scheduler.run("test-spec");

    expect(reporter.onComplete).toHaveBeenCalledWith("test-spec");
    expect(runner.execute).not.toHaveBeenCalled();
  });
});
