import { CodeForgeConfig } from "../config/types.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";
import { TaskStorage } from "./TaskStorage.js";
import { ExecuteReviewUseCase } from "../application/use-cases/ExecuteReviewUseCase.js";
import { ValidatePlanUseCase } from "../application/use-cases/ValidatePlanUseCase.js";
import { HookContext, HookEvent, ReviewResultMetadata } from "../domain/hook.js";
import { IntentExecutionState } from "../domain/execution.js";
import {
  SchedulerRunOptions,
  SchedulerRunResult,
  ReviewExecutionContext,
} from "./types.js";

export class ReviewCoordinator {
  constructor(
    private config: CodeForgeConfig,
    private stateRepo: ExecutionStateRepository,
    private storage: TaskStorage,
    private reviewUseCase?: ExecuteReviewUseCase,
    private validatePlanUseCase?: ValidatePlanUseCase,
  ) {}

  private createHookContext(
    event: HookEvent,
    intentName: string,
    reviewResult?: ReviewResultMetadata,
  ): HookContext {
    return {
      event,
      intentName,
      ...(reviewResult ? { reviewResult } : {}),
    };
  }

  resolveReviewOptions(options: SchedulerRunOptions): Required<SchedulerRunOptions> {
    // An explicit bypass is safer and deterministic when both flags are supplied.
    return {
      forceReview: options.forceReview === true,
      skipReview: options.skipReview === true,
    };
  }

  maxReviewRounds(): number {
    const configured = this.config.aiReview?.maxRounds ?? 3;
    return Number.isFinite(configured) ? Math.max(0, Math.floor(configured)) : 3;
  }

  shouldRunReview(state: IntentExecutionState, input: SchedulerRunOptions): boolean {
    const options = this.resolveReviewOptions(input);
    if (options.skipReview || (state.reviewApproved && !options.forceReview)) {
      return false;
    }
    if (!(this.config.aiReview?.enabled || options.forceReview)) {
      return false;
    }
    return (state.reviewRounds ?? 0) < this.maxReviewRounds();
  }

  async reviewCompletedTasks(
    intentName: string,
    state: IntentExecutionState,
    context: ReviewExecutionContext,
  ): Promise<SchedulerRunResult> {
    const round = (state.reviewRounds ?? 0) + 1;
    const maxRounds = this.maxReviewRounds();
    context.onStatusChange?.("reviewing");
    state.status = "reviewing";
    delete state.reviewError;
    this.stateRepo.save(state);
    context.reporter?.onReviewStart?.(intentName, {
      agent: this.config.aiReview?.agent ?? "default",
      round,
      maxRounds,
    });

    // This snapshot is deliberately taken by the scheduler. It provides the
    // transaction boundary even when the reviewer throws after writing output.
    const filesBeforeReview = new Set(this.storage.listJsonTaskFiles(intentName));
    try {
      await context.hooks?.dispatch(this.createHookContext("review.started", intentName));
      if (!this.reviewUseCase || !this.validatePlanUseCase) {
        throw new Error("AI review services are not configured.");
      }
      const completedTasks = this.storage.loadTasks(intentName).filter(
        (task) => state.tasks[task.id]?.status === "completed",
      );
      const review = await this.reviewUseCase.execute({
        intentName,
        completedTasks,
        onLog: (chunk) => context.reporter?.onLog?.("review", chunk),
      });

      // Validate even on an apparent approval. Otherwise an invalid JSON file
      // left by a prior reviewer attempt could remain outside execution state
      // while the current reviewer creates zero files and completes the run.
      const validation = this.validatePlanUseCase.execute(intentName);
      if (validation.kind !== "valid") {
        const details =
          validation.kind === "invalid"
            ? validation.errors.join("\n")
            : validation.kind;
        throw new Error(`Reviewer-created tasks failed plan validation: ${details}`);
      }

      if (review.newTaskFiles.length === 0) {
        const result: ReviewResultMetadata = {
          outcome: "approved",
          newTasksCount: 0,
          taskIds: [],
        };
        await context.hooks?.dispatch(
          this.createHookContext("review.completed", intentName, result),
        );
        context.reporter?.onReviewEnd?.(intentName, result);
        return context.onCompleteRun(intentName, state);
      }

      const generated = this.storage
        .loadTasks(intentName)
        .filter((task) => review.newTaskIds.includes(task.id));
      if (generated.length !== review.newTaskIds.length) {
        throw new Error("Reviewer-created task files could not be loaded.");
      }
      for (const task of generated) {
        state.tasks[task.id] = {
          status: "pending",
          dependencies: task.dependencies ?? [],
          title: task.title,
        };
      }
      state.reviewRounds = round;
      state.status = "paused";
      context.onStatusChange?.("paused");
      this.stateRepo.save(state);
      const result: ReviewResultMetadata = {
        outcome: "tasks_created",
        newTasksCount: generated.length,
        taskIds: generated.map((task) => task.id),
      };
      context.reporter?.onUpdate(intentName);
      context.reporter?.onReviewEnd?.(intentName, result);
      await context.hooks?.dispatch(
        this.createHookContext("review.completed", intentName, result),
      );
      return {
        status: "pending",
        intentName,
        newTasks: result.taskIds,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.storage.cleanupReviewOutput(intentName, filesBeforeReview);
      // Deliberately do not touch individual task records: completed timestamps are retry evidence.
      state.status = "paused";
      state.reviewError = message;
      context.onStatusChange?.("paused");
      this.stateRepo.save(state);
      context.reporter?.onReviewError?.(intentName, { message, round });
      if (!context.reporter?.onReviewError) {
        context.reporter?.onError(new Error(message));
      }
      return {
        status: "paused",
        intentName,
        reason: message,
      };
    }
  }
}
