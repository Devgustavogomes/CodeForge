import { describe, it, expect, vi } from "vitest";
import { createAppContainer } from "../../src/infrastructure/container.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { FakeProcessExecutor } from "../helpers/fake-process-executor.js";
import { TaskOperationsUseCase } from "../../src/application/use-cases/TaskOperationsUseCase.js";
import { ConfigureEnvironmentUseCase } from "../../src/application/use-cases/ConfigureEnvironmentUseCase.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { ConfigService } from "../../src/config/ConfigService.js";
import { AgentRunner } from "../../src/runners/AgentRunner.js";
import { DeleteIntentUseCase } from "../../src/application/use-cases/DeleteIntentUseCase.js";
import { DeleteTaskUseCase } from "../../src/application/use-cases/DeleteTaskUseCase.js";
import { DeleteDocUseCase } from "../../src/application/use-cases/DeleteDocUseCase.js";
import { DocsManifestRepository } from "../../src/infrastructure/repositories/DocsManifestRepository.js";

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
    expect(container.listIntentsUseCase).toBeDefined();
    expect(container.getIntentStatusUseCase).toBeDefined();
    expect(container.createIntentUseCase).toBeDefined();
    expect(container.validatePlanUseCase).toBeDefined();
    expect(container.pullIntentUseCase).toBeDefined();
    expect(container.taskOperationsUseCase).toBeDefined();
    expect(container.deleteIntentUseCase).toBeInstanceOf(DeleteIntentUseCase);
    expect(container.deleteTaskUseCase).toBeInstanceOf(DeleteTaskUseCase);
    expect(container.deleteDocUseCase).toBeInstanceOf(DeleteDocUseCase);
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

  it("uses shared dependencies for deletion use cases", () => {
    const memoryGw = new InMemoryWorkspaceGateway();
    const stateRepo = new ExecutionStateRepository(memoryGw);
    const docsRepo = new DocsManifestRepository(memoryGw);

    const container = createAppContainer({
      workspaceGateway: memoryGw,
      executionStateRepository: stateRepo,
      docsManifestRepository: docsRepo,
    });

    expect(container.deleteIntentUseCase).toMatchObject({
      workspace: container.workspaceGateway,
      docsManifestRepository: container.docsManifestRepository,
    });
    expect(container.deleteTaskUseCase).toMatchObject({
      gw: container.workspaceGateway,
      stateRepo: container.executionStateRepository,
    });
    expect(container.deleteDocUseCase).toMatchObject({
      gw: container.workspaceGateway,
      manifestRepo: container.docsManifestRepository,
    });
  });

  it("returns deletion use-case overrides unchanged and independently", () => {
    const memoryGw = new InMemoryWorkspaceGateway();
    const deleteIntentUseCase = {} as DeleteIntentUseCase;
    const deleteTaskUseCase = {} as DeleteTaskUseCase;
    const deleteDocUseCase = {} as DeleteDocUseCase;

    const intentContainer = createAppContainer(memoryGw, {
      deleteIntentUseCase,
    });
    const taskContainer = createAppContainer(memoryGw, {
      deleteTaskUseCase,
    });
    const docContainer = createAppContainer(memoryGw, {
      deleteDocUseCase,
    });

    expect(intentContainer.deleteIntentUseCase).toBe(deleteIntentUseCase);
    expect(intentContainer.deleteTaskUseCase).toBeInstanceOf(DeleteTaskUseCase);
    expect(intentContainer.deleteDocUseCase).toBeInstanceOf(DeleteDocUseCase);

    expect(taskContainer.deleteTaskUseCase).toBe(deleteTaskUseCase);
    expect(taskContainer.deleteIntentUseCase).toBeInstanceOf(DeleteIntentUseCase);
    expect(taskContainer.deleteDocUseCase).toBeInstanceOf(DeleteDocUseCase);

    expect(docContainer.deleteDocUseCase).toBe(deleteDocUseCase);
    expect(docContainer.deleteIntentUseCase).toBeInstanceOf(DeleteIntentUseCase);
    expect(docContainer.deleteTaskUseCase).toBeInstanceOf(DeleteTaskUseCase);
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
});

describe("Constructor injection in use cases", () => {
  it("TaskOperationsUseCase uses injected ExecutionStateRepository", () => {
    const memoryGw = new InMemoryWorkspaceGateway();
    const customRepo = new ExecutionStateRepository(memoryGw);
    const loadSpy = vi.spyOn(customRepo, "load").mockReturnValue(null);

    const useCase = new TaskOperationsUseCase(memoryGw, customRepo);
    const result = useCase.markTaskCompleted("my-intent", "TASK-001");

    expect(loadSpy).toHaveBeenCalledWith("my-intent");
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
