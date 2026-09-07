import { describe, it, expect, vi } from "vitest";
import { createAppContainer } from "../../src/infrastructure/container.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { FakeProcessExecutor } from "../helpers/fake-process-executor.js";
import { TaskOperationsUseCase } from "../../src/application/use-cases/TaskOperationsUseCase.js";
import { ConfigureEnvironmentUseCase } from "../../src/application/use-cases/ConfigureEnvironmentUseCase.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { ConfigService } from "../../src/config/ConfigService.js";
import { AgentRunner } from "../../src/runners/AgentRunner.js";

describe("AppContainer composition root", () => {
  it("initializes default container when called without arguments", () => {
    const container = createAppContainer();

    expect(container.gw).toBeDefined();
    expect(container.workspaceGateway).toBe(container.gw);
    expect(container.processExecutor).toBeDefined();
    expect(container.stateRepo).toBeDefined();
    expect(container.executionStateRepository).toBe(container.stateRepo);
    expect(container.docsRepo).toBeDefined();
    expect(container.docsManifestRepository).toBe(container.docsRepo);
    expect(container.configService).toBeDefined();
    expect(container.promptService).toBeDefined();
    expect(container.runnerProvider).toBeDefined();

    expect(container.initializeWorkspaceUseCase).toBeDefined();
    expect(container.initUseCase).toBe(container.initializeWorkspaceUseCase);
    expect(container.configureEnvironmentUseCase).toBeDefined();
    expect(container.configureEnvUseCase).toBe(container.configureEnvironmentUseCase);
    expect(container.listSpecsUseCase).toBeDefined();
    expect(container.getSpecStatusUseCase).toBeDefined();
    expect(container.createSpecUseCase).toBeDefined();
    expect(container.validatePlanUseCase).toBeDefined();
    expect(container.pullSpecUseCase).toBeDefined();
    expect(container.taskOperationsUseCase).toBeDefined();
  });

  it("uses provided workspace gateway", () => {
    const memoryGw = new InMemoryWorkspaceGateway();
    const container = createAppContainer(memoryGw);

    expect(container.gw).toBe(memoryGw);
    expect(container.workspaceGateway).toBe(memoryGw);
  });

  it("supports partial overrides for dependencies and use cases", () => {
    const memoryGw = new InMemoryWorkspaceGateway();
    const fakeExecutor = new FakeProcessExecutor();
    const mockRunner: AgentRunner = {
      execute: vi.fn().mockResolvedValue(undefined),
      getAvailableAgents: vi.fn().mockResolvedValue(["custom-agent-1", "custom-agent-2"]),
    };
    const customRunnerProvider = vi.fn().mockReturnValue(mockRunner);

    const container = createAppContainer(memoryGw, {
      processExecutor: fakeExecutor,
      runnerProvider: customRunnerProvider,
    });

    expect(container.processExecutor).toBe(fakeExecutor);
    expect(container.runnerProvider).toBe(customRunnerProvider);
    expect(container.runnerProvider("antigravity")).toBe(mockRunner);
  });

  it("allows overriding specific use cases", () => {
    const memoryGw = new InMemoryWorkspaceGateway();
    const mockTaskOps = {} as TaskOperationsUseCase;

    const container = createAppContainer(memoryGw, {
      taskOperationsUseCase: mockTaskOps,
    });

    expect(container.taskOperationsUseCase).toBe(mockTaskOps);
  });

  it("creates TaskScheduler via helper method", () => {
    const memoryGw = new InMemoryWorkspaceGateway();
    const container = createAppContainer(memoryGw);

    const mockRunner: AgentRunner = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const config = {
      environment: "antigravity",
      plannerAgent: "default",
      executorAgent: "default",
      language: "en" as const,
    };

    const scheduler = container.createTaskScheduler(mockRunner, config);
    expect(scheduler).toBeDefined();
  });

  it("does not expose createReactiveTaskScheduler", () => {
    const memoryGw = new InMemoryWorkspaceGateway();
    const container = createAppContainer(memoryGw);

    expect((container as Record<string, unknown>).createReactiveTaskScheduler).toBeUndefined();
  });
});

describe("Constructor injection in use cases", () => {
  it("TaskOperationsUseCase uses injected ExecutionStateRepository", () => {
    const memoryGw = new InMemoryWorkspaceGateway();
    const customRepo = new ExecutionStateRepository(memoryGw);
    const loadSpy = vi.spyOn(customRepo, "load").mockReturnValue(null);

    const useCase = new TaskOperationsUseCase(memoryGw, customRepo);
    const result = useCase.markTaskCompleted("my-spec", "TASK-001");

    expect(loadSpy).toHaveBeenCalledWith("my-spec");
    expect(result).toEqual({ kind: "not-found" });
  });

  it("ConfigureEnvironmentUseCase uses injected ConfigService and runnerProvider", async () => {
    const memoryGw = new InMemoryWorkspaceGateway();
    const customConfigService = new ConfigService(memoryGw);
    const mockRunner: AgentRunner = {
      execute: vi.fn().mockResolvedValue(undefined),
      getAvailableAgents: vi.fn().mockResolvedValue(["injected-agent"]),
    };
    const runnerProvider = vi.fn().mockReturnValue(mockRunner);

    const useCase = new ConfigureEnvironmentUseCase(memoryGw, customConfigService, runnerProvider);

    const agents = await useCase.getAgentsForEnvironment("custom-env");
    expect(runnerProvider).toHaveBeenCalledWith("custom-env");
    expect(agents).toEqual(["injected-agent"]);

    const saveSpy = vi.spyOn(customConfigService, "saveConfig");
    useCase.saveConfig({
      environment: "custom-env",
      plannerAgent: "p",
      executorAgent: "e",
      language: "en",
    });
    expect(saveSpy).toHaveBeenCalled();
  });
});
