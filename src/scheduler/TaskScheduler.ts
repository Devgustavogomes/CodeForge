import { DAGResolver } from "./DAGResolver.js";
import { Task } from "../domain/task.js";
import { IntentExecutionState } from "../domain/execution.js";
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
  private status: SchedulerStatus = "idle";
  private storage: TaskStorage;
  private taskExecutor: TaskExecutor;
  private reviewCoordinator: ReviewCoordinator;
  private stateManager: SchedulerStateManager;

  constructor(private deps: TaskSchedulerDependencies) {
    this.syncHookReporter();
    this.storage = new TaskStorage(this.deps.gw);
    this.stateManager = new SchedulerStateManager(this.deps.stateRepo);
    this.taskExecutor = new TaskExecutor(
      this.deps.runner,
      this.deps.config,
      this.deps.stateRepo,
      this.deps.promptService,
    );
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
      await this.deps.hooks?.dispatch(createHookContext(event, intentName));
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

  private async completeRun(intentName: string, state: IntentExecutionState): Promise<SchedulerRunResult> {
    this.status = "completed";
    this.stateManager.recordCompletion(state);
    this.deps.reporter?.onComplete(intentName);
    await this.deps.hooks?.dispatch(createHookContext("run.completed", intentName));
    return createResult("completed", intentName);
  }

  private async finishOrReview(
    intentName: string,
    state: IntentExecutionState,
    options: SchedulerRunOptions,
  ): Promise<SchedulerRunResult> {
    if (this.stateManager.allTasksCompleted(state) && this.reviewCoordinator.shouldRunReview(state, options)) {
      return this.reviewCoordinator.reviewCompletedTasks(intentName, state, {
        options,
        reporter: this.deps.reporter,
        hooks: this.deps.hooks,
        onCompleteRun: (name, st) => this.completeRun(name, st),
        onStatusChange: (status) => {
          this.status = status;
        },
      });
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
          const promise = this.taskExecutor
            .executeTask(intentName, task, {
              model,
              reporter: this.deps.reporter,
              hooks: this.deps.hooks,
            })
            .finally(() => {
              activeTasks.delete(taskId);
            });
          activeTasks.set(taskId, promise);
        }
      }
    }
  }

  private async evaluateIdleRun(
    intentName: string,
    state: IntentExecutionState,
    options: SchedulerRunOptions,
  ): Promise<SchedulerRunResult | undefined> {
    if (this.stateManager.allTasksCompleted(state)) {
      return this.finishOrReview(intentName, state, options);
    }

    const counts = this.stateManager.getTaskCounts(state);
    if (counts.running === 0 && counts.pending > 0) {
      this.status = "deadlock";
      this.stateManager.recordDeadlock(state);
      this.deps.reporter?.onDeadlock(intentName);
      await this.deps.hooks?.dispatch(createHookContext("run.deadlock", intentName));
      return createResult("deadlock", intentName);
    }

    if (counts.running === 0 && counts.pending === 0 && counts.failed > 0) {
      this.status = "failed";
      this.stateManager.recordFailure(state);
      const reason = "One or more tasks failed.";
      this.reportFail(intentName, reason);
      await this.deps.hooks?.dispatch(createHookContext("run.failed", intentName));
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

    const prep = this.stateManager.prepareState(intentName, tasks, options);
    if (!prep.ready) {
      this.status = prep.result.status as SchedulerStatus;
      if (prep.result.status === "completed") {
        this.deps.reporter?.onComplete(intentName);
      } else if (prep.result.status === "failed") {
        this.reportFail(intentName, prep.result.reason ?? "Intent execution has failed tasks.");
      }
      return prep.result;
    }

    this.status = "running";
    const resolver = new DAGResolver();
    this.deps.reporter?.onStart(intentName);
    await this.deps.hooks?.dispatch(
      createHookContext("run.started", intentName),
    );

    const activeTasks = new Map<string, Promise<void>>();

    try {
      while (true) {
        const currentState = this.stateManager.load(intentName);
        if (!currentState) {
          return this.failRun(
            intentName,
            `Execution state not found for intent: ${intentName}`,
          );
        }

        if (currentState.status === "completed") {
          return this.finishOrReview(intentName, currentState, options);
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

        await Promise.race(activeTasks.values());
      }
    } catch (error) {
      this.status = "failed";
      const message = error instanceof Error ? error.message : String(error);
      this.deps.reporter?.onError(error instanceof Error ? error : message);
      return createResult("failed", intentName, message);
    } finally {
      this.deps.promptService.deletePromptDir(intentName);
    }
  }
}
