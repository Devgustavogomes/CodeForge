import { ExecutionRecoveryCoordinator } from "./ExecutionRecoveryCoordinator.js";
import { ConflictResolutionCoordinator } from "./ConflictResolutionCoordinator.js";
import { CleanupCoordinator } from "./CleanupCoordinator.js";
import { DeliveryCoordinator } from "./DeliveryCoordinator.js";
import { IntegrationCoordinator } from "./IntegrationCoordinator.js";
import { WorktreeLifecycle } from "../infrastructure/worktrees/WorktreeLifecycle.js";
import { NodeGitGateway } from "../infrastructure/git/NodeGitGateway.js";
import { NodeProcessExecutor } from "../infrastructure/process/NodeProcessExecutor.js";
import { DAGResolver } from "./DAGResolver.js";
import { Task } from "../domain/task.js";
import { IntentExecutionState, isTaskIntegrated } from "../domain/execution.js";
import { SchedulerReporter } from "../application/ports/SchedulerReporter.js";
import { HookDispatcher } from "../application/ports/HookDispatcher.js";
import { HookReporter } from "../application/ports/HookReporter.js";
import { HookEvent } from "../domain/hook.js";
import {
  SchedulerStatus,
  SchedulerRunResult,
  SchedulerRunOptions,
  TaskSchedulerDependencies,
} from "./types.js";
import { createResult, createHookContext } from "./helpers.js";
import { TaskStorage } from "./TaskStorage.js";
import { TaskExecutor } from "./TaskExecutor.js";
import { ReviewCoordinator } from "./ReviewCoordinator.js";
import { SchedulerStateManager } from "./SchedulerStateManager.js";

export class TaskScheduler {
  private readonly cwd: string;
  private readonly worktrees: NonNullable<TaskSchedulerDependencies["worktreeLifecycle"]>;
  private status: SchedulerStatus = "idle";
  private storage: TaskStorage;
  private taskExecutor: TaskExecutor;
  private reviewCoordinator: ReviewCoordinator;
  private stateManager: SchedulerStateManager;
  private integration: IntegrationCoordinator;
  private resolutionModel?: string;
  private delivery: DeliveryCoordinator;
  private recovery: Pick<ExecutionRecoveryCoordinator, "reconcile">;
  private cleanup: Pick<CleanupCoordinator, "cleanup">;

  constructor(private deps: TaskSchedulerDependencies) {
    this.cwd = deps.cwd ?? process.cwd();
    this.worktrees = deps.worktreeLifecycle ?? new WorktreeLifecycle(new NodeGitGateway(this.cwd), new NodeProcessExecutor(), deps.stateRepo);
    this.delivery = new DeliveryCoordinator(deps.stateRepo, deps.deliveryGit ?? new NodeGitGateway(this.cwd));
    this.cleanup = deps.cleanupCoordinator ?? new CleanupCoordinator(deps.stateRepo, new NodeGitGateway(this.cwd), new NodeProcessExecutor());
    this.recovery = deps.recoveryCoordinator ?? new ExecutionRecoveryCoordinator(deps.stateRepo, new NodeGitGateway(this.cwd), new NodeProcessExecutor());
    this.syncHookReporter();
    this.storage = new TaskStorage(this.deps.gw);
    this.stateManager = new SchedulerStateManager(this.deps.stateRepo);
    this.taskExecutor = new TaskExecutor(
      this.deps.runner,
      this.deps.config,
      this.deps.stateRepo,
      this.deps.promptService,
      this.cwd,
      this.deps.taskResultGit,
    );
    const conflictGit = deps.conflictResolutionGit ?? new NodeGitGateway(this.cwd);
    const conflicts = new ConflictResolutionCoordinator(deps.stateRepo, conflictGit, {
      resolve: async (intentName, taskId, cwd) => {
        const task = this.storage.loadTasks(intentName).find(item => item.id === taskId);
        if (!task) throw new Error("Conflict task definition is missing: " + taskId);
        await this.taskExecutor.resolveConflict(intentName, task, { cwd, model: this.resolutionModel,
          reporter: this.deps.reporter, hooks: this.deps.hooks });
      },
      verify: (intentName, taskId, cwd) => this.taskExecutor.verify(intentName, taskId, this.deps.hooks, cwd),
    });
    this.integration = new IntegrationCoordinator(deps.stateRepo, deps.integrationGit ?? new NodeGitGateway(this.cwd), conflicts);
    this.reviewCoordinator = new ReviewCoordinator(
      this.deps.config,
      this.deps.stateRepo,
      this.storage,
      this.deps.reviewUseCase,
      this.deps.validatePlanUseCase,
    );
  }

  private syncHookReporter(): void {
    if (this.deps.hookReporter && this.deps.hooks?.setReporter) {
      this.deps.hooks.setReporter(this.deps.hookReporter);
    }
  }

  getStatus(): SchedulerStatus {
    return this.status;
  }

  getReporter(): SchedulerReporter | undefined {
    return this.deps.reporter;
  }

  setReporter(reporter?: SchedulerReporter): void {
    this.deps.reporter = reporter;
  }

  getHookDispatcher(): HookDispatcher | undefined {
    return this.deps.hooks;
  }

  setHookDispatcher(hooks?: HookDispatcher): void {
    this.deps.hooks = hooks;
    this.syncHookReporter();
  }

  getHookReporter(): HookReporter | undefined {
    if (this.deps.hookReporter) {
      return this.deps.hookReporter;
    }
    if (
      this.deps.hooks &&
      "getReporter" in this.deps.hooks &&
      typeof (this.deps.hooks as { getReporter?: unknown }).getReporter === "function"
    ) {
      return (
        this.deps.hooks as { getReporter: () => HookReporter | undefined }
      ).getReporter();
    }
    return undefined;
  }

  setHookReporter(reporter?: HookReporter): void {
    this.deps.hookReporter = reporter;
    if (this.deps.hooks?.setReporter) {
      this.deps.hooks.setReporter(reporter);
    }
  }

  private reportFail(intentName: string, message: string): void {
    if (this.deps.reporter?.onFail) {
      this.deps.reporter.onFail(intentName);
      this.deps.reporter.onError(new Error(message));
    } else {
      this.deps.reporter?.onError(new Error(message));
    }
  }

  private async failRun(
    intentName: string,
    reason: string,
    event?: HookEvent,
  ): Promise<SchedulerRunResult> {
    this.status = "failed";
    this.reportFail(intentName, reason);
    if (event) {
      await this.deps.hooks?.dispatch(createHookContext(event, intentName, this.cwd));
    }
    return createResult("failed", intentName, reason);
  }

  private pauseForTaskLoadError(intentName: string, error: unknown): SchedulerRunResult {
    const recorded = this.stateManager.recordTaskLoadError(intentName, error);
    if (!recorded) {
      this.status = "failed";
      const message = `Unable to load task files: ${error instanceof Error ? error.message : String(error)}`;
      this.deps.reporter?.onError(new Error(message));
      return createResult("failed", intentName, message);
    }

    this.status = "paused";
    this.deps.reporter?.onReviewError?.(intentName, recorded);
    if (!this.deps.reporter?.onReviewError) {
      this.deps.reporter?.onError(new Error(recorded.message));
    }
    return createResult("paused", intentName, recorded.message);
  }

  private async cleanupDeliveredRun(intentName: string): Promise<void> {
    try {
      const result = await this.cleanup.cleanup(intentName);
      for (const message of result.failures) this.deps.reporter?.onWarning?.("Cleanup: " + message);
    } catch (error) {
      const message = "Cleanup failed: " + (error instanceof Error ? error.message : String(error));
      this.deps.stateRepo.update(intentName, current => {
        (current.diagnostics ??= []).push({ stage: "cleanup", message, recordedAt: new Date().toISOString() });
      });
      this.deps.reporter?.onWarning?.(message);
    }
    const state = this.deps.stateRepo.load(intentName);
    if (state) this.deps.reporter?.onOutcome?.(intentName, state);
  }

  private async completeRun(intentName: string, state: IntentExecutionState): Promise<SchedulerRunResult> {
    this.deps.stateRepo.update(intentName, current => { current.reviewApproved = true; });
    const delivery = this.delivery.deliver(intentName, true);
    if (!delivery.delivered) {
      this.status = "paused";
      const pending = this.deps.stateRepo.load(intentName);
      if (pending) this.deps.reporter?.onOutcome?.(intentName, pending);
      this.deps.reporter?.onError(new Error(delivery.reason));
      return createResult("paused", intentName, delivery.reason);
    }
    this.status = "completed";
    this.stateManager.recordCompletion(state);
    await this.cleanupDeliveredRun(intentName);
    this.deps.reporter?.onComplete(intentName, this.deps.stateRepo.load(intentName) ?? undefined);
    await this.deps.hooks?.dispatch(createHookContext("run.completed", intentName, this.cwd));
    return createResult("completed", intentName);
  }

  private async finishOrReview(
    intentName: string,
    state: IntentExecutionState,
    options: SchedulerRunOptions,
  ): Promise<SchedulerRunResult> {
    if (state.integrationQueue?.length || state.operations?.some(op => op.kind === "integration" && op.status === "intended")) {
      this.status = "paused";
      this.deps.stateRepo.update(intentName, current => { current.status = "paused"; });
      return createResult("paused", intentName, "Pending integrations must settle before review or delivery.");
    }
    if (this.stateManager.allTasksCompleted(state) && this.reviewCoordinator.shouldRunReview(state, options)) {
      return this.reviewCoordinator.reviewCompletedTasks(intentName, state, {
        cwd: this.cwd,
        options,
        reporter: this.deps.reporter,
        hooks: this.deps.hooks,
        onCompleteRun: (name, st) => this.completeRun(name, st),
        onStatusChange: (status) => {
          this.status = status;
        },
      });
    }
    if (!options.skipReview && (this.deps.config.aiReview?.enabled || options.forceReview) && !state.reviewApproved) {
      this.status = "paused";
      this.deps.stateRepo.update(intentName, current => { current.status = "paused"; });
      return createResult("paused", intentName, "Review approval is required before delivery; review rounds are exhausted.");
    }
    return this.completeRun(intentName, state);
  }

  private dispatchReadyTasks(
    intentName: string,
    tasks: Task[],
    state: IntentExecutionState,
    activeTasks: Map<string, Promise<void>>,
    resolver: DAGResolver,
    model?: string,
  ): void {
    const readyTaskIds = resolver.getReadyTasks(state);
    for (const taskId of readyTaskIds) {
      if (!activeTasks.has(taskId)) {
        const task = tasks.find((t) => t.id === taskId);
        if (task) {
          const promise = this.prepareAndExecuteTask(intentName, task, state.lastAcceptedCommit ?? this.worktrees.getIntegrationCommit(intentName), model)
            .finally(() => {
              activeTasks.delete(taskId);
            });
          activeTasks.set(taskId, promise);
        }
      }
    }
  }

  private async prepareAndExecuteTask(intentName: string, task: Task, baseCommit: string, model?: string): Promise<void> {
    try {
      await this.taskExecutor.executeTask(intentName, task, {
        cwd: this.cwd,
        prepareWorktree: () => this.worktrees.prepareTask(
          intentName, task.id, baseCommit,
        ),
        runId: this.deps.stateRepo.load(intentName)?.runId, model,
        reporter: this.deps.reporter, hooks: this.deps.hooks,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.stateRepo.updateTask(intentName, task.id, record => {
        if (record.status === "failed") return;
        record.status = "failed";
        record.stage = "preparation";
        const recordedAt = new Date().toISOString();
        (record.errors ??= []).push(message);
        (record.diagnostics ??= []).push({ stage: "preparation", message, recordedAt });
        (record.stages ??= {}).preparation = { status: "failed", completedAt: recordedAt };
      });
      this.deps.reporter?.onUpdate(intentName);
    }
  }

  private async evaluateIdleRun(
    intentName: string,
    state: IntentExecutionState,
    options: SchedulerRunOptions,
  ): Promise<SchedulerRunResult | undefined> {
    if (this.stateManager.allTasksCompleted(state)) {
      return await this.finishOrReview(intentName, state, options);
    }

    const counts = this.stateManager.getTaskCounts(state);
    if (counts.running === 0 && ((counts.failed > 0 && counts.pending > 0) || Object.values(state.tasks).some(task =>
      task.integration?.status === "blocked" || task.integration?.status === "failed"))) {
      this.stateManager.recordFailure(state);
      return this.failRun(intentName, "Tasks or integrations failed; dependent tasks are blocked.", "run.failed");
    }

    if (counts.running === 0 && Object.entries(state.tasks).some(([id, task]) =>
      task.status === "completed" && !isTaskIntegrated(state, id))) {
      this.status = "paused";
      this.deps.stateRepo.update(intentName, current => { current.status = "paused"; });
      return createResult("paused", intentName, "Dependencies are blocked by missing approval or integration evidence.");
    }

    if (counts.running === 0 && counts.pending > 0) {
      this.status = "deadlock";
      this.stateManager.recordDeadlock(state);
      this.deps.reporter?.onDeadlock(intentName);
      await this.deps.hooks?.dispatch(createHookContext("run.deadlock", intentName, this.cwd));
      return createResult("deadlock", intentName);
    }

    if (counts.running === 0 && counts.pending === 0 && counts.failed > 0) {
      this.status = "failed";
      this.stateManager.recordFailure(state);
      const reason = "One or more tasks failed.";
      this.reportFail(intentName, reason);
      await this.deps.hooks?.dispatch(createHookContext("run.failed", intentName, this.cwd));
      return createResult("failed", intentName, reason);
    }

    return undefined;
  }

  async runAll(
    intentName: string,
    model?: string,
    options?: SchedulerRunOptions,
  ): Promise<SchedulerRunResult> {
    return this.run(intentName, model, options);
  }

  async run(
    intentName: string,
    modelOrOptions?: string | SchedulerRunOptions,
    suppliedOptions?: SchedulerRunOptions,
  ): Promise<SchedulerRunResult> {
    const model = typeof modelOrOptions === "string" ? modelOrOptions : undefined;
    const options = this.reviewCoordinator.resolveReviewOptions(
      typeof modelOrOptions === "object" ? modelOrOptions : suppliedOptions ?? {},
    );
    this.resolutionModel = model;
    let tasks: Task[];
    try {
      tasks = this.storage.loadTasks(intentName);
    } catch (error) {
      return this.pauseForTaskLoadError(intentName, error);
    }
    if (tasks.length === 0) {
      this.status = "failed";
      const message = `No tasks found for intent: ${intentName}`;
      this.deps.reporter?.onError(new Error(message));
      return createResult("failed", intentName, message);
    }

    const prior = this.deps.stateRepo.load(intentName);
    if (!prior) {
      try { await this.worktrees.initializeRun(intentName, tasks, this.cwd); }
      catch (error) {
        return this.failRun(intentName, error instanceof Error ? error.message : String(error));
      }
    }
    if (prior) {
      try {
        const recovered = await this.recovery.reconcile(intentName);
        if (!recovered.ready) {
          this.status = "paused";
          return createResult("paused", intentName, recovered.reason);
        }
      } catch (error) {
        this.status = "paused";
        return createResult("paused", intentName, String(error));
      }
    }
    try { this.integration.acquire(intentName); }
    catch (error) {
      this.status = "paused";
      return createResult("paused", intentName, error instanceof Error ? error.message : String(error));
    }
    try {
      const prep = this.stateManager.prepareState(intentName, tasks, options);
      if (!prep.ready) {
        this.status = prep.result.status as SchedulerStatus;
        if (prep.result.status === "completed") {
          await this.cleanupDeliveredRun(intentName);
          this.deps.reporter?.onComplete(intentName, this.deps.stateRepo.load(intentName) ?? undefined);
        } else if (prep.result.status === "failed") {
          this.reportFail(intentName, prep.result.reason ?? "Intent execution has failed tasks.");
        }
        return prep.result;
      }

      if (prior) {
        try { await this.worktrees.prepareIntegration(intentName); }
        catch (error) { return this.failRun(intentName, error instanceof Error ? error.message : String(error)); }
      }
      this.status = "running";
      const resolver = new DAGResolver();
      this.deps.reporter?.onStart(intentName);
      await this.deps.hooks?.dispatch(
        createHookContext("run.started", intentName, this.cwd),
      );

      const activeTasks = new Map<string, Promise<void>>();

      try {
        while (true) {
          await this.integration.drain(intentName);
          const currentState = this.stateManager.load(intentName);
          if (currentState) this.deps.reporter?.onOutcome?.(intentName, currentState);
          if (!currentState) {
            return this.failRun(
              intentName,
              `Execution state not found for intent: ${intentName}`,
            );
          }

          if (currentState.status === "completed" && this.stateManager.allTasksCompleted(currentState)) {
            return await this.finishOrReview(intentName, currentState, options);
          }

          if (currentState.status === "failed") {
            return this.failRun(intentName, "Intent execution failed.", "run.failed");
          }

          this.dispatchReadyTasks(
            intentName,
            tasks,
            currentState,
            activeTasks,
            resolver,
            model,
          );

          if (activeTasks.size === 0) {
            const terminalResult = await this.evaluateIdleRun(
              intentName,
              currentState,
              options,
            );
            if (terminalResult) {
              return terminalResult;
            }
          }

          if (activeTasks.size === 0) {
            this.status = "paused";
            return createResult("paused", intentName,
              "Persisted operations have no completion promises in this orchestrator. Inspect process ownership before resuming.");
          }
          await Promise.race(activeTasks.values());
        }
      } catch (error) {
        this.status = "failed";
        const message = error instanceof Error ? error.message : String(error);
        this.deps.reporter?.onError(error instanceof Error ? error : message);
        return createResult("failed", intentName, message);
      }
    } finally { this.integration.release(intentName); }
  }
}
