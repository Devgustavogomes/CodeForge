import { randomUUID } from "node:crypto";
import path from "node:path";
import { ExecutionOperation, IntentExecutionState, isTaskIntegrated } from "../domain/execution.js";
import { DirectoryGitGateway } from "../infrastructure/git/GitGateway.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";

export type DeliveryGit = Pick<DirectoryGitGateway,
  "getRepositoryInfo" | "getStatus" | "isAncestor" | "updateOriginalBranch">;

/** Delivery never discards checkout changes or removes integration artifacts. */
export class DeliveryCoordinator {
  constructor(private readonly stateRepo: ExecutionStateRepository, private readonly git: DeliveryGit) {}

  deliver(intentName: string, reviewSatisfied: boolean): { delivered: boolean; reason?: string } {
    const state = this.stateRepo.load(intentName);
    if (!state) throw new Error("Execution state not found: " + intentName);
    let operation: ExecutionOperation | undefined;
    try {
      if (!reviewSatisfied || state.reviewError || state.status === "failed" || state.recovery ||
          !Object.keys(state.tasks).length || !Object.keys(state.tasks).every(id => isTaskIntegrated(state, id)) ||
          state.integrationQueue?.length || state.operations?.some(op => op.kind !== "delivery" && op.status === "intended")) {
        throw new Error("Delivery requires all tasks and integrations to succeed and review follow-up to be resolved.");
      }
      if (!state.runId || !state.repositoryPath || !state.originalWorktreePath || !state.originalBranch ||
          !state.originalCommit || !state.integrationWorktreePath || !state.integrationBranch || !state.lastAcceptedCommit) {
        throw new Error("Original checkout or integration identity is incomplete; reconcile recorded Git evidence.");
      }
      this.inspectIntegration(state);
      const previous = state.operations?.filter(op => op.kind === "delivery" && op.status === "intended").at(-1);
      if (state.delivery?.status === "succeeded" || previous) {
        // Recover a crash after Git updated the branch but before the outcome was saved.
        const evidence = previous ?? state.operations?.find(op => op.id === state.delivery?.operationId && op.status === "succeeded");
        if (!evidence || evidence.expectedAfter.headCommit !== state.lastAcceptedCommit ||
            evidence.before.headCommit !== state.originalCommit || evidence.before.branch !== state.originalBranch ||
            evidence.before.worktreePath !== state.originalWorktreePath || evidence.runId !== state.runId ||
            evidence.expectedAfter.branch !== state.originalBranch || evidence.expectedAfter.worktreePath !== state.originalWorktreePath ||
            evidence.source?.branch !== state.integrationBranch || evidence.source.worktreePath !== state.integrationWorktreePath ||
            evidence.source.headCommit !== state.lastAcceptedCommit) {
          throw new Error("Delivery evidence is incomplete; reconcile before retrying.");
        }
        try {
          this.inspectOriginal(state, state.lastAcceptedCommit);
          this.recordSuccess(intentName, evidence, state);
          return { delivered: true };
        } catch (error) {
          if (state.delivery?.status === "succeeded") throw error;
          // An intended operation whose checkout is still at the original base is retryable.
          this.inspectOriginal(state, state.originalCommit);
          operation = previous;
        }
      }
      this.inspectOriginal(state, state.originalCommit);
      if (!operation) {
        const before = { repositoryPath: state.repositoryPath, branch: state.originalBranch,
          worktreePath: state.originalWorktreePath, headCommit: state.originalCommit, exists: true };
        operation = { id: randomUUID(), runId: state.runId, attempt: 0, kind: "delivery", status: "intended",
          intendedAt: new Date().toISOString(), owner: state.integrationOwner, before,
          source: { repositoryPath: state.repositoryPath, branch: state.integrationBranch,
            worktreePath: state.integrationWorktreePath, headCommit: state.lastAcceptedCommit, exists: true },
          expectedAfter: { ...before, headCommit: state.lastAcceptedCommit } };
        const intended = operation;
        this.stateRepo.update(intentName, current => {
          if (current.lastAcceptedCommit !== state.lastAcceptedCommit) throw new Error("Accepted integration changed before delivery.");
          (current.operations ??= []).push(intended);
          current.delivery = { status: "running", originalCommit: state.originalCommit,
            resultCommit: state.lastAcceptedCommit, operationId: intended.id, startedAt: intended.intendedAt };
        });
      }
      const intendedOperation = operation;
      this.stateRepo.update(intentName, current => {
        current.delivery = { ...current.delivery, status: "running", originalCommit: state.originalCommit,
          resultCommit: state.lastAcceptedCommit, operationId: intendedOperation.id, startedAt: intendedOperation.intendedAt };
      });
      // Recheck after persisting intent, immediately before the guarded Git update.
      this.inspectIntegration(state);
      this.inspectOriginal(state, state.originalCommit);
      if (!this.git.updateOriginalBranch(state.originalWorktreePath, state.originalBranch, state.originalCommit, state.lastAcceptedCommit)) {
        throw new Error("Original checkout changed during delivery; restore its recorded branch and clean base before retrying.");
      }
      this.inspectOriginal(state, state.lastAcceptedCommit);
      this.inspectIntegration(state);
      this.recordSuccess(intentName, operation, state);
      return { delivered: true };
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error)) +
        " Result retained on the integration branch " + (state.integrationBranch ?? "(unrecorded)") + "; inspect and retry delivery after reconciliation.";
      this.stateRepo.update(intentName, current => {
        current.status = "paused";
        delete current.completedAt;
        current.delivery = { ...current.delivery, status: "pending", originalCommit: state.originalCommit,
          resultCommit: state.lastAcceptedCommit };
        delete current.delivery.deliveredCommit;
        (current.diagnostics ??= []).push({ stage: "delivery", message: reason,
          recordedAt: new Date().toISOString(), operationId: operation?.id });
      });
      return { delivered: false, reason };
    }
  }

  private inspectIntegration(state: IntentExecutionState): void {
    const info = this.git.getRepositoryInfo(state.integrationWorktreePath!);
    if (path.resolve(info.directory) !== path.resolve(state.integrationWorktreePath!) ||
        info.branch !== state.integrationBranch || info.head !== state.lastAcceptedCommit ||
        this.git.getStatus(state.integrationWorktreePath!).some(entry => entry.kind !== "ignored") ||
        !this.git.isAncestor(state.integrationWorktreePath!, state.originalCommit!, state.lastAcceptedCommit!) ||
        !Object.values(state.tasks).every(task => this.git.isAncestor(state.integrationWorktreePath!, task.resultCommit!, state.lastAcceptedCommit!))) {
      throw new Error("Integration checkout differs from the complete accepted result.");
    }
  }

  private inspectOriginal(state: IntentExecutionState, expected: string): void {
    const original = this.git.getRepositoryInfo(state.originalWorktreePath!);
    const repository = this.git.getRepositoryInfo(state.repositoryPath!);
    const integration = this.git.getRepositoryInfo(state.integrationWorktreePath!);
    if (path.resolve(original.directory) !== path.resolve(state.originalWorktreePath!) ||
        path.resolve(repository.directory) !== path.resolve(state.repositoryPath!) ||
        original.commonDirectory !== repository.commonDirectory || original.commonDirectory !== integration.commonDirectory ||
        original.branch !== state.originalBranch || original.head !== expected) {
      throw new Error("Original repository, checked-out branch or HEAD changed since the run started.");
    }
    if (this.git.getStatus(state.originalWorktreePath!).some(entry => entry.kind !== "ignored")) {
      throw new Error("Original index, working tree or nonignored untracked files changed; preserve user work before retrying.");
    }
  }

  private recordSuccess(intentName: string, operation: ExecutionOperation, snapshot: IntentExecutionState): void {
    this.stateRepo.update(intentName, current => {
      if (current.runId !== snapshot.runId || current.lastAcceptedCommit !== snapshot.lastAcceptedCommit || current.reviewError ||
          current.integrationQueue?.length || Object.keys(current.tasks).length !== Object.keys(snapshot.tasks).length ||
          !Object.keys(current.tasks).every(id => isTaskIntegrated(current, id) &&
            current.tasks[id].resultCommit === snapshot.tasks[id]?.resultCommit)) throw new Error("Accepted evidence changed during delivery.");
      const saved = current.operations!.find(op => op.id === operation.id)!;
      const now = new Date().toISOString();
      saved.status = "succeeded";
      saved.outcome = { recordedAt: now, after: { ...saved.expectedAfter } };
      current.delivery = { status: "succeeded", originalCommit: snapshot.originalCommit,
        resultCommit: snapshot.lastAcceptedCommit, deliveredCommit: snapshot.lastAcceptedCommit,
        startedAt: operation.intendedAt, completedAt: now, operationId: operation.id };
    });
  }
}
