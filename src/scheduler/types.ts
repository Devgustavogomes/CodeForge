import { WorktreeLifecycle } from "../infrastructure/worktrees/WorktreeLifecycle.js";
import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { AgentRunner } from "../runners/AgentRunner.js";
import { CodeForgeConfig } from "../config/types.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../application/services/PromptService.js";
import { SchedulerReporter } from "../application/ports/SchedulerReporter.js";
import { HookDispatcher } from "../application/ports/HookDispatcher.js";
import { HookReporter } from "../application/ports/HookReporter.js";
import { ExecuteReviewUseCase } from "../application/use-cases/ExecuteReviewUseCase.js";
import { ValidatePlanUseCase } from "../application/use-cases/ValidatePlanUseCase.js";

export type SchedulerStatus =
  | "idle"
  | "paused"
  | "running"
  | "reviewing"
  | "completed"
  | "failed"
  | "deadlock";

export type SchedulerRunResult =
  | { status: "completed"; intentName: string }
  | { status: "pending"; intentName: string; newTasks: string[] }
  | { status: "paused"; intentName: string; reason?: string }
  | { status: "failed"; intentName: string; reason?: string }
  | { status: "deadlock"; intentName: string };

/** Per-invocation controls for the optional terminal AI review. */
export interface SchedulerRunOptions {
  forceReview?: boolean;
  skipReview?: boolean;
}

export type TaskResultGit = Pick<import("../infrastructure/git/GitGateway.js").DirectoryGitGateway,
  "getRepositoryInfo" | "getStatus" | "stageAll" | "commit" | "getCommitMessage" | "isAncestor">;

export type IntegrationGit = Pick<import("../infrastructure/git/GitGateway.js").DirectoryGitGateway,
  "getRepositoryInfo" | "getStatus" | "isAncestor" | "integrate">;

export interface TaskSchedulerDependencies {
  recoveryCoordinator?: Pick<import("./ExecutionRecoveryCoordinator.js").ExecutionRecoveryCoordinator, "reconcile">;
  cleanupCoordinator?: Pick<import("./CleanupCoordinator.js").CleanupCoordinator, "cleanup">;
  deliveryGit?: import("./DeliveryCoordinator.js").DeliveryGit;
  integrationGit?: IntegrationGit;
  conflictResolutionGit?: import("./ConflictResolutionCoordinator.js").ConflictResolutionGit;
  taskResultGit?: TaskResultGit;
  worktreeLifecycle?: Pick<WorktreeLifecycle, "initializeRun" | "prepareIntegration" | "prepareTask" | "getIntegrationCommit">;
  cwd?: string;
  gw: WorkspaceGateway;
  runner: AgentRunner;
  config: CodeForgeConfig;
  stateRepo: ExecutionStateRepository;
  promptService: PromptService;
  reporter?: SchedulerReporter;
  hooks?: HookDispatcher;
  hookReporter?: HookReporter;
  reviewUseCase?: ExecuteReviewUseCase;
  validatePlanUseCase?: ValidatePlanUseCase;
}

export interface TaskExecutionContext {
  prepareWorktree?: () => Promise<import("../infrastructure/git/GitGateway.js").OwnedWorktree>;
  runId?: string;
  worktreePath?: string;
  baseCommit?: string;
  attempt?: number;
  cwd: string;
  model?: string;
  reporter?: SchedulerReporter;
  hooks?: HookDispatcher;
}

import { IntentExecutionState } from "../domain/execution.js";

export interface ReviewExecutionContext {
  cwd: string;
  options: SchedulerRunOptions;
  reporter?: SchedulerReporter;
  hooks?: HookDispatcher;
  onCompleteRun: (intentName: string, state: IntentExecutionState) => Promise<SchedulerRunResult>;
  onStatusChange?: (status: SchedulerStatus) => void;
}
