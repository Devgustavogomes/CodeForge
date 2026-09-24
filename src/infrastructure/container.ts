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
import { ListIntentsUseCase } from "../application/use-cases/ListIntentsUseCase.js";
import { GetIntentStatusUseCase } from "../application/use-cases/GetIntentStatusUseCase.js";
import { CreateIntentUseCase } from "../application/use-cases/CreateIntentUseCase.js";
import { ValidatePlanUseCase } from "../application/use-cases/ValidatePlanUseCase.js";
import { PullIntentUseCase } from "../application/use-cases/PullIntentUseCase.js";
import { TaskOperationsUseCase } from "../application/use-cases/TaskOperationsUseCase.js";
import { GeneratePlanUseCase } from "../application/use-cases/GeneratePlanUseCase.js";
import { CreateDocUseCase } from "../application/use-cases/CreateDocUseCase.js";
import { UpdateDocUseCase } from "../application/use-cases/UpdateDocUseCase.js";
import { DeleteIntentUseCase } from "../application/use-cases/DeleteIntentUseCase.js";
import { DeleteTaskUseCase } from "../application/use-cases/DeleteTaskUseCase.js";
import { DeleteDocUseCase } from "../application/use-cases/DeleteDocUseCase.js";
import { GitGateway } from "./git/GitGateway.js";
import { NodeGitGateway } from "./git/NodeGitGateway.js";
import { TaskScheduler } from "../scheduler/TaskScheduler.js";
import { SchedulerReporter } from "../application/ports/SchedulerReporter.js";
import { HookDispatcher } from "../application/ports/HookDispatcher.js";
import { HookReporter } from "../application/ports/HookReporter.js";
import { IntentSourceFactory } from "./intent-sources/IntentSourceFactory.js";
import { ExecuteReviewUseCase } from "../application/use-cases/ExecuteReviewUseCase.js";

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
  intentSourceFactory?: typeof IntentSourceFactory;
  hookReporter?: HookReporter;

  initializeWorkspaceUseCase?: InitializeWorkspaceUseCase;
  initUseCase?: InitializeWorkspaceUseCase;
  configureEnvironmentUseCase?: ConfigureEnvironmentUseCase;
  configureEnvUseCase?: ConfigureEnvironmentUseCase;
  listIntentsUseCase?: ListIntentsUseCase;
  getIntentStatusUseCase?: GetIntentStatusUseCase;
  createIntentUseCase?: CreateIntentUseCase;
  validatePlanUseCase?: ValidatePlanUseCase;
  pullIntentUseCase?: PullIntentUseCase;
  taskOperationsUseCase?: TaskOperationsUseCase;
  generatePlanUseCase?: GeneratePlanUseCase;
  createDocUseCase?: CreateDocUseCase;
  updateDocUseCase?: UpdateDocUseCase;
  deleteIntentUseCase?: DeleteIntentUseCase;
  deleteTaskUseCase?: DeleteTaskUseCase;
  deleteDocUseCase?: DeleteDocUseCase;
  executeReviewUseCase?: ExecuteReviewUseCase;
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
  gitGateway: GitGateway;
  runnerProvider: (environment: string) => AgentRunner;
  intentSourceFactory: typeof IntentSourceFactory;

  // Use cases
  initializeWorkspaceUseCase: InitializeWorkspaceUseCase;
  initUseCase: InitializeWorkspaceUseCase;
  configureEnvironmentUseCase: ConfigureEnvironmentUseCase;
  configureEnvUseCase: ConfigureEnvironmentUseCase;
  listIntentsUseCase: ListIntentsUseCase;
  getIntentStatusUseCase: GetIntentStatusUseCase;
  createIntentUseCase: CreateIntentUseCase;
  validatePlanUseCase: ValidatePlanUseCase;
  pullIntentUseCase: PullIntentUseCase;
  taskOperationsUseCase: TaskOperationsUseCase;
  generatePlanUseCase: GeneratePlanUseCase;
  createDocUseCase: CreateDocUseCase;
  updateDocUseCase: UpdateDocUseCase;
  deleteIntentUseCase: DeleteIntentUseCase;
  deleteTaskUseCase: DeleteTaskUseCase;
  deleteDocUseCase: DeleteDocUseCase;
  executeReviewUseCase: ExecuteReviewUseCase;

  createGeneratePlanUseCase(config: CodeForgeConfig): GeneratePlanUseCase;

  hookReporter?: HookReporter;

  // Helpers
  createTaskScheduler(
    runner: AgentRunner,
    config: CodeForgeConfig,
    reporter?: SchedulerReporter,
    hooks?: HookDispatcher,
    hookReporter?: HookReporter,
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
      configService,
      runnerProvider,
    );

  const listIntentsUseCase =
    overrides?.listIntentsUseCase ??
    new ListIntentsUseCase(workspaceGateway, stateRepo);

  const getIntentStatusUseCase =
    overrides?.getIntentStatusUseCase ??
    new GetIntentStatusUseCase(workspaceGateway, stateRepo);

  const createIntentUseCase =
    overrides?.createIntentUseCase ??
    new CreateIntentUseCase(workspaceGateway);

  const validatePlanUseCase =
    overrides?.validatePlanUseCase ??
    new ValidatePlanUseCase(workspaceGateway);

  const intentSourceFactory =
    overrides?.intentSourceFactory ?? IntentSourceFactory;

  const pullIntentUseCase =
    overrides?.pullIntentUseCase ??
    new PullIntentUseCase(workspaceGateway, undefined, intentSourceFactory);

  const taskOperationsUseCase =
    overrides?.taskOperationsUseCase ??
    new TaskOperationsUseCase(workspaceGateway, stateRepo);

  const deleteIntentUseCase =
    overrides?.deleteIntentUseCase ??
    new DeleteIntentUseCase(workspaceGateway, docsRepo);

  const deleteTaskUseCase =
    overrides?.deleteTaskUseCase ??
    new DeleteTaskUseCase(workspaceGateway, stateRepo);

  const deleteDocUseCase =
    overrides?.deleteDocUseCase ??
    new DeleteDocUseCase(workspaceGateway, docsRepo);

  const hookReporter = overrides?.hookReporter;

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
    gitGateway,
    runnerProvider,
    intentSourceFactory,
    hookReporter,

    initializeWorkspaceUseCase,
    initUseCase: initializeWorkspaceUseCase,
    configureEnvironmentUseCase,
    configureEnvUseCase: configureEnvironmentUseCase,
    validatePlanUseCase,
    taskOperationsUseCase,
    deleteTaskUseCase,
    deleteDocUseCase,

    get listIntentsUseCase(): ListIntentsUseCase {
      return listIntentsUseCase;
    },
    get getIntentStatusUseCase(): GetIntentStatusUseCase {
      return getIntentStatusUseCase;
    },
    get createIntentUseCase(): CreateIntentUseCase {
      return createIntentUseCase;
    },
    get pullIntentUseCase(): PullIntentUseCase {
      return pullIntentUseCase;
    },
    get deleteIntentUseCase(): DeleteIntentUseCase {
      return deleteIntentUseCase;
    },

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
      return new GeneratePlanUseCase(workspaceGateway, runner, config, validatePlanUseCase);
    },

    createGeneratePlanUseCase(config: CodeForgeConfig): GeneratePlanUseCase {
      if (overrides?.generatePlanUseCase) {
        return overrides.generatePlanUseCase;
      }
      const runner = runnerProvider(config.environment);
      return new GeneratePlanUseCase(workspaceGateway, runner, config, validatePlanUseCase);
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
      return new CreateDocUseCase(workspaceGateway, runner, config, docsRepo);
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
      return new UpdateDocUseCase(workspaceGateway, gitGateway, runner, config, docsRepo);
    },

    get executeReviewUseCase(): ExecuteReviewUseCase {
      if (overrides?.executeReviewUseCase) {
        return overrides.executeReviewUseCase;
      }
      const config = configService.loadConfig() ?? {
        environment: "antigravity",
        plannerAgent: "default",
        executorAgent: "default",
        language: "en",
      };
      return new ExecuteReviewUseCase(
        workspaceGateway,
        gitGateway,
        runnerProvider(config.environment),
        promptService,
        config,
      );
    },

    createTaskScheduler(
      runner: AgentRunner,
      config: CodeForgeConfig,
      reporter?: SchedulerReporter,
      hooks?: HookDispatcher,
      schedulerHookReporter?: HookReporter,
    ): TaskScheduler {
      return new TaskScheduler(
        workspaceGateway,
        runner,
        config,
        stateRepo,
        promptService,
        reporter,
        hooks,
        schedulerHookReporter ?? hookReporter,
        // Keep these trailing optional constructor dependencies so direct scheduler
        // construction in integrations remains source-compatible.
        overrides?.executeReviewUseCase ?? new ExecuteReviewUseCase(
          workspaceGateway,
          gitGateway,
          runner,
          promptService,
          config,
        ),
        validatePlanUseCase,
      );
    },
  };
}
