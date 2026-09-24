import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";
import { Task } from "../domain/task.js";
import { IntentExecutionState } from "../domain/execution.js";
import { SchedulerRunOptions, SchedulerRunResult } from "./types.js";
import { createResult } from "./helpers.js";

export interface TaskCounts {
  running: number;
  pending: number;
  failed: number;
}

export class SchedulerStateManager {
  constructor(private stateRepo: ExecutionStateRepository) {}

  load(intentName: string): IntentExecutionState | null {
    return this.stateRepo.load(intentName);
  }

  save(state: IntentExecutionState): void {
    this.stateRepo.save(state);
  }

  getTaskCounts(state: IntentExecutionState): TaskCounts {
    const tasks = Object.values(state.tasks);
    return {
      running: tasks.filter((t) => t.status === "running").length,
      pending: tasks.filter((t) => t.status === "pending").length,
      failed: tasks.filter((t) => t.status === "failed").length,
    };
  }

  allTasksCompleted(state: IntentExecutionState): boolean {
    const counts = this.getTaskCounts(state);
    return counts.running === 0 && counts.pending === 0 && counts.failed === 0;
  }

  prepareState(
    intentName: string,
    tasks: Task[],
    options: SchedulerRunOptions,
  ): { ready: true } | { ready: false; result: SchedulerRunResult } {
    let state = this.stateRepo.load(intentName);
    if (!state) {
      state = this.stateRepo.init(intentName, tasks);
      this.stateRepo.save(state);
      return { ready: true };
    }

    if (state.status === "completed" && !options.forceReview) {
      return { ready: false, result: createResult("completed", intentName) };
    }

    const { pending, failed } = this.getTaskCounts(state);
    if (pending === 0 && failed > 0) {
      const reason = "Intent execution has failed tasks.";
      return {
        ready: false,
        result: createResult("failed", intentName, reason),
      };
    }

    state.status = "running";
    this.stateRepo.save(state);
    return { ready: true };
  }

  recordTaskLoadError(intentName: string, error: unknown): { message: string; round: number } | null {
    const message = `Unable to load task files: ${error instanceof Error ? error.message : String(error)}`;
    const state = this.stateRepo.load(intentName);
    if (!state) {
      return null;
    }

    const round = (state.reviewRounds ?? 0) + 1;
    state.status = "paused";
    state.reviewError = message;
    this.stateRepo.save(state);
    return { message, round };
  }

  recordCompletion(state: IntentExecutionState): void {
    state.status = "completed";
    state.reviewApproved = true;
    state.completedAt = new Date().toISOString();
    this.stateRepo.save(state);
  }

  recordDeadlock(state: IntentExecutionState): void {
    state.status = "failed";
    state.completedAt = new Date().toISOString();
    this.stateRepo.save(state);
  }

  recordFailure(state: IntentExecutionState): void {
    state.status = "failed";
    state.completedAt = new Date().toISOString();
    this.stateRepo.save(state);
  }
}
