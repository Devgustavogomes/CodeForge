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
    cwd: string,
    reviewResult?: ReviewResultMetadata,
  ): HookContext {
    return {
      event,
      intentName,
      cwd,
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
    state = this.stateRepo.update(intentName, (current) => {
      current.status = "reviewing";
      delete current.reviewError;
    });
    context.reporter?.onReviewStart?.(intentName, {
      agent: this.config.aiReview?.agent ?? "default",
      round,
      maxRounds,
    });

    // This snapshot is deliberately taken by the scheduler. It provides the
    // transaction boundary even when the reviewer throws after writing output.
    const filesBeforeReview = new Set(this.storage.listJsonTaskFiles(intentName));
    try {
      await context.hooks?.dispatch(this.createHookContext("review.started", intentName, context.cwd));
      if (!this.reviewUseCase || !this.validatePlanUseCase) {
        throw new Error("AI review services are not configured.");
      }
      if (!state.originalCommit || !state.lastAcceptedCommit || !state.integrationWorktreePath) {
        throw new Error("Recorded original and accepted integration commits are required for review.");
      }
      const completedTasks = this.storage.loadTasks(intentName).filter(
        (task) => state.tasks[task.id]?.status === "completed",
      );
      const review = await this.reviewUseCase.execute({
        intentName,
        completedTasks,
        cwd: state.integrationWorktreePath,
        accumulatedResult: { directory: state.integrationWorktreePath!,
          baseCommit: state.originalCommit!, resultCommit: state.lastAcceptedCommit! },
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
          this.createHookContext("review.completed", intentName, context.cwd, result),
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
      state = this.stateRepo.update(intentName, (current) => {
        for (const task of generated) {
          if (current.tasks[task.id]) throw new Error("Reviewer task already exists");
          current.tasks[task.id] = {
            status: "pending", dependencies: task.dependencies ?? [], title: task.title,
            attempt: 0, stages: {}, integration: { status: "pending" }, diagnostics: [],
          };
        }
        current.reviewApproved = false;
        delete current.completedAt;
        current.reviewRounds = round;
        current.status = "paused";
      });
      context.onStatusChange?.("paused");
      const result: ReviewResultMetadata = {
        outcome: "tasks_created",
        newTasksCount: generated.length,
        taskIds: generated.map((task) => task.id),
      };
      context.reporter?.onUpdate(intentName);
      context.reporter?.onReviewEnd?.(intentName, result);
      await context.hooks?.dispatch(
        this.createHookContext("review.completed", intentName, context.cwd, result),
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
      state = this.stateRepo.update(intentName, (current) => {
        current.status = "paused";
        current.reviewError = message;
      });
      context.onStatusChange?.("paused");
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
