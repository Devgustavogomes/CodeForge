import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";
import { Task } from "../domain/task.js";
import { IntentExecutionState, isTaskIntegrated } from "../domain/execution.js";
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
    return counts.running === 0 && counts.pending === 0 && counts.failed === 0 &&
      Object.keys(state.tasks).every(id => isTaskIntegrated(state, id));
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

    if (this.allTasksCompleted(state) && state.delivery?.status === "succeeded" &&
        state.delivery.deliveredCommit === state.lastAcceptedCommit && !options.forceReview) {
      if (state.status !== "completed") this.recordCompletion(state);
      return { ready: false, result: createResult("completed", intentName) };
    }

    if (state.owner || Object.values(state.tasks).some(task => task.status === "running")) {
      return { ready: false, result: createResult("paused", intentName,
        "Startup recovery must settle previous process ownership before resumed scheduling.") };
    }

    const { pending, failed } = this.getTaskCounts(state);
    if (pending === 0 && failed > 0 && !Object.values(state.tasks).some(task =>
      task.status === "running" || (task.status === "completed" && task.integration?.status === "pending"))) {
      const reason = "Intent execution has failed tasks.";
      return {
        ready: false,
        result: createResult("failed", intentName, reason),
      };
    }

    this.stateRepo.update(intentName, (current) => { current.status = "running"; });
    return { ready: true };
  }

  recordTaskLoadError(intentName: string, error: unknown): { message: string; round: number } | null {
    const message = `Unable to load task files: ${error instanceof Error ? error.message : String(error)}`;
    const state = this.stateRepo.load(intentName);
    if (!state) {
      return null;
    }

    const round = (state.reviewRounds ?? 0) + 1;
    this.stateRepo.update(intentName, (current) => {
      current.status = "paused";
      current.reviewError = message;
    });
    return { message, round };
  }

  recordCompletion(state: IntentExecutionState): void {
    this.stateRepo.update(state.intentId, (current) => {
      if (!this.allTasksCompleted(current) || current.delivery?.status !== "succeeded" ||
          !current.delivery.deliveredCommit || current.delivery.deliveredCommit !== current.lastAcceptedCommit) {
        throw new Error("Verified delivery is required before completing a run.");
      }
      current.status = "completed";
      current.reviewApproved = true;
      current.completedAt = new Date().toISOString();
    });
  }

  recordDeadlock(state: IntentExecutionState): void {
    this.stateRepo.update(state.intentId, (current) => {
      current.status = "failed";
      current.completedAt = new Date().toISOString();
    });
  }

  recordFailure(state: IntentExecutionState): void {
    this.stateRepo.update(state.intentId, (current) => {
      current.status = "failed";
      current.completedAt = new Date().toISOString();
    });
  }
}
