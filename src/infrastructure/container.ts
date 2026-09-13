import { WorkspaceGateway, NodeWorkspaceGateway } from "./workspace.js";
import { ProcessExecutor } from "./process/ProcessExecutor.js";
import { NodeProcessExecutor } from "./process/NodeProcessExecutor.js";
import { ExecutionStateRepository } from "./repositories/ExecutionStateRepository.js";
import { DocsManifestRepository } from "./repositories/DocsManifestRepository.js";
import { ConfigService } from "../config/ConfigService.js";
import { CodeForgeConfig } from "../config/types.js";
import { PromptService } from "../application/services/PromptService.js";
import { RunnerFactory } from "../runners/RunnerFactory.js";
import { AgentRunner } from "../runners/AgentRunner.js";
import { InitializeWorkspaceUseCase } from "../application/use-cases/InitializeWorkspaceUseCase.js";
import { ConfigureEnvironmentUseCase } from "../application/use-cases/ConfigureEnvironmentUseCase.js";
import { ListSpecsUseCase } from "../application/use-cases/ListSpecsUseCase.js";
import { GetSpecStatusUseCase } from "../application/use-cases/GetSpecStatusUseCase.js";
import { CreateSpecUseCase } from "../application/use-cases/CreateSpecUseCase.js";
import { ValidatePlanUseCase } from "../application/use-cases/ValidatePlanUseCase.js";
import { PullSpecUseCase } from "../application/use-cases/PullSpecUseCase.js";
import { TaskOperationsUseCase } from "../application/use-cases/TaskOperationsUseCase.js";
import { GeneratePlanUseCase } from "../application/use-cases/GeneratePlanUseCase.js";
import { CreateDocUseCase } from "../application/use-cases/CreateDocUseCase.js";
import { UpdateDocUseCase } from "../application/use-cases/UpdateDocUseCase.js";
import { DeleteSpecUseCase } from "../application/use-cases/DeleteSpecUseCase.js";
import { DeleteTaskUseCase } from "../application/use-cases/DeleteTaskUseCase.js";
import { DeleteDocUseCase } from "../application/use-cases/DeleteDocUseCase.js";
import { GitGateway } from "./git/GitGateway.js";
import { NodeGitGateway } from "./git/NodeGitGateway.js";
import { TaskScheduler } from "../scheduler/TaskScheduler.js";
import { SchedulerReporter } from "../application/ports/SchedulerReporter.js";
import { HookDispatcher } from "../application/ports/HookDispatcher.js";

export interface AppContainerDependencies {
  workspaceGateway?: WorkspaceGateway;
  gw?: WorkspaceGateway;
  processExecutor?: ProcessExecutor;
  executionStateRepository?: ExecutionStateRepository;
  stateRepo?: ExecutionStateRepository;
  docsManifestRepository?: DocsManifestRepository;
  docsRepo?: DocsManifestRepository;
  configService?: ConfigService;
  promptService?: PromptService;
  runnerProvider?: (environment: string) => AgentRunner;
  gitGateway?: GitGateway;

  initializeWorkspaceUseCase?: InitializeWorkspaceUseCase;
  initUseCase?: InitializeWorkspaceUseCase;
  configureEnvironmentUseCase?: ConfigureEnvironmentUseCase;
  configureEnvUseCase?: ConfigureEnvironmentUseCase;
  listSpecsUseCase?: ListSpecsUseCase;
  getSpecStatusUseCase?: GetSpecStatusUseCase;
  createSpecUseCase?: CreateSpecUseCase;
  validatePlanUseCase?: ValidatePlanUseCase;
  pullSpecUseCase?: PullSpecUseCase;
  taskOperationsUseCase?: TaskOperationsUseCase;
  generatePlanUseCase?: GeneratePlanUseCase;
  createDocUseCase?: CreateDocUseCase;
  updateDocUseCase?: UpdateDocUseCase;
  deleteSpecUseCase?: DeleteSpecUseCase;
  deleteTaskUseCase?: DeleteTaskUseCase;
  deleteDocUseCase?: DeleteDocUseCase;
}

export interface AppContainer {
  gw: WorkspaceGateway;
  workspaceGateway: WorkspaceGateway;
  processExecutor: ProcessExecutor;
  stateRepo: ExecutionStateRepository;
  executionStateRepository: ExecutionStateRepository;
  docsRepo: DocsManifestRepository;
  docsManifestRepository: DocsManifestRepository;
  configService: ConfigService;
  promptService: PromptService;
  runnerProvider: (environment: string) => AgentRunner;

  // Use cases
  initializeWorkspaceUseCase: InitializeWorkspaceUseCase;
  initUseCase: InitializeWorkspaceUseCase;
  configureEnvironmentUseCase: ConfigureEnvironmentUseCase;
  configureEnvUseCase: ConfigureEnvironmentUseCase;
  listSpecsUseCase: ListSpecsUseCase;
  getSpecStatusUseCase: GetSpecStatusUseCase;
  createSpecUseCase: CreateSpecUseCase;
  validatePlanUseCase: ValidatePlanUseCase;
  pullSpecUseCase: PullSpecUseCase;
  taskOperationsUseCase: TaskOperationsUseCase;
  generatePlanUseCase: GeneratePlanUseCase;
  createDocUseCase: CreateDocUseCase;
  updateDocUseCase: UpdateDocUseCase;
  deleteSpecUseCase: DeleteSpecUseCase;
  deleteTaskUseCase: DeleteTaskUseCase;
  deleteDocUseCase: DeleteDocUseCase;

  // Helpers
  createTaskScheduler(
    runner: AgentRunner,
    config: CodeForgeConfig,
    reporter?: SchedulerReporter,
    hooks?: HookDispatcher,
  ): TaskScheduler;
}

export function createAppContainer(
  gwOrOverrides?: WorkspaceGateway | Partial<AppContainerDependencies>,
  explicitOverrides?: Partial<AppContainerDependencies>,
): AppContainer {
  let initialGw: WorkspaceGateway | undefined;
  let overrides: Partial<AppContainerDependencies> | undefined;

  if (
    gwOrOverrides &&
    ("readFile" in gwOrOverrides || "writeFile" in gwOrOverrides)
  ) {
    initialGw = gwOrOverrides as WorkspaceGateway;
    overrides = explicitOverrides;
  } else if (gwOrOverrides) {
    overrides = gwOrOverrides as Partial<AppContainerDependencies>;
  }

  const workspaceGateway =
    overrides?.workspaceGateway ??
    overrides?.gw ??
    initialGw ??
    new NodeWorkspaceGateway(process.cwd());

  const processExecutor =
    overrides?.processExecutor ?? new NodeProcessExecutor();

  const configService =
    overrides?.configService ?? new ConfigService(workspaceGateway);

  const promptService =
    overrides?.promptService ?? new PromptService(workspaceGateway);

  const stateRepo =
    overrides?.stateRepo ??
    overrides?.executionStateRepository ??
    new ExecutionStateRepository(workspaceGateway);

  const docsRepo =
    overrides?.docsRepo ??
    overrides?.docsManifestRepository ??
    new DocsManifestRepository(workspaceGateway);

  const runnerProvider =
    overrides?.runnerProvider ??
    ((environment: string) =>
      RunnerFactory.createRunner(environment, processExecutor));

  const gitGateway =
    overrides?.gitGateway ?? new NodeGitGateway(workspaceGateway);

  const initializeWorkspaceUseCase =
    overrides?.initializeWorkspaceUseCase ??
    overrides?.initUseCase ??
    new InitializeWorkspaceUseCase(workspaceGateway);

  const configureEnvironmentUseCase =
    overrides?.configureEnvironmentUseCase ??
    overrides?.configureEnvUseCase ??
    new ConfigureEnvironmentUseCase(
      workspaceGateway,
      configService,
      runnerProvider,
    );

  const listSpecsUseCase =
    overrides?.listSpecsUseCase ?? new ListSpecsUseCase(workspaceGateway);

  const getSpecStatusUseCase =
    overrides?.getSpecStatusUseCase ??
    new GetSpecStatusUseCase(workspaceGateway);

  const createSpecUseCase =
    overrides?.createSpecUseCase ?? new CreateSpecUseCase(workspaceGateway);

  const validatePlanUseCase =
    overrides?.validatePlanUseCase ??
    new ValidatePlanUseCase(workspaceGateway);

  const pullSpecUseCase =
    overrides?.pullSpecUseCase ?? new PullSpecUseCase(workspaceGateway);

  const taskOperationsUseCase =
    overrides?.taskOperationsUseCase ??
    new TaskOperationsUseCase(workspaceGateway, stateRepo);

  const deleteSpecUseCase =
    overrides?.deleteSpecUseCase ??
    new DeleteSpecUseCase(workspaceGateway, docsRepo);

  const deleteTaskUseCase =
    overrides?.deleteTaskUseCase ??
    new DeleteTaskUseCase(workspaceGateway, stateRepo);

  const deleteDocUseCase =
    overrides?.deleteDocUseCase ??
    new DeleteDocUseCase(workspaceGateway, docsRepo);

  return {
    gw: workspaceGateway,
    workspaceGateway,
    processExecutor,
    stateRepo,
    executionStateRepository: stateRepo,
    docsRepo,
    docsManifestRepository: docsRepo,
    configService,
    promptService,
    runnerProvider,

    initializeWorkspaceUseCase,
    initUseCase: initializeWorkspaceUseCase,
    configureEnvironmentUseCase,
    configureEnvUseCase: configureEnvironmentUseCase,
    listSpecsUseCase,
    getSpecStatusUseCase,
    createSpecUseCase,
    validatePlanUseCase,
    pullSpecUseCase,
    taskOperationsUseCase,
    deleteSpecUseCase,
    deleteTaskUseCase,
    deleteDocUseCase,

    get generatePlanUseCase(): GeneratePlanUseCase {
      if (overrides?.generatePlanUseCase) {
        return overrides.generatePlanUseCase;
      }
      const config = configService.loadConfig() ?? {
        environment: "antigravity",
        plannerAgent: "default",
        executorAgent: "default",
        language: "en",
      };
      const runner = runnerProvider(config.environment);
      return new GeneratePlanUseCase(workspaceGateway, runner, config);
    },

    get createDocUseCase(): CreateDocUseCase {
      if (overrides?.createDocUseCase) {
        return overrides.createDocUseCase;
      }
      const config = configService.loadConfig() ?? {
        environment: "antigravity",
        plannerAgent: "default",
        executorAgent: "default",
        language: "en",
      };
      const runner = runnerProvider(config.environment);
      return new CreateDocUseCase(workspaceGateway, runner, config);
    },

    get updateDocUseCase(): UpdateDocUseCase {
      if (overrides?.updateDocUseCase) {
        return overrides.updateDocUseCase;
      }
      const config = configService.loadConfig() ?? {
        environment: "antigravity",
        plannerAgent: "default",
        executorAgent: "default",
        language: "en",
      };
      const runner = runnerProvider(config.environment);
      return new UpdateDocUseCase(workspaceGateway, gitGateway, runner, config);
    },

    createTaskScheduler(
      runner: AgentRunner,
      config: CodeForgeConfig,
      reporter?: SchedulerReporter,
      hooks?: HookDispatcher,
    ): TaskScheduler {
      return new TaskScheduler(
        workspaceGateway,
        runner,
        config,
        stateRepo,
        promptService,
        reporter,
        hooks,
      );
    },
  };
}
