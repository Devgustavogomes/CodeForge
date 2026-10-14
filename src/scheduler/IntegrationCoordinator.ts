import { randomUUID } from "node:crypto";
import os from "node:os";
import { ExecutionOperation, GitIdentity, isTaskIntegrated, ProcessOwnership } from "../domain/execution.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";
import type { ConflictResolutionCoordinator } from "./ConflictResolutionCoordinator.js";
import { IntegrationGit } from "./types.js";

/** Owns the entire Git/evidence transaction, beyond the gateway's Git command lock. */
export class IntegrationCoordinator {
  private owner?: ProcessOwnership;

  constructor(private readonly stateRepo: ExecutionStateRepository, private readonly git: IntegrationGit,
    private readonly conflicts?: ConflictResolutionCoordinator) {}

  acquire(intentName: string): void {
    if (this.owner) throw new Error("This coordinator already owns an execution.");
    const owner: ProcessOwnership = { pid: process.pid, host: os.hostname(), token: randomUUID(),
      startedAt: new Date().toISOString() };
    this.stateRepo.update(intentName, state => {
      if (state.integrationOwner) throw new Error("Integration ownership is occupied; reconcile the persisted owner before resuming.");
      state.integrationOwner = owner;
    });
    this.owner = owner;
  }

  release(intentName: string): void {
    this.assertOwner(intentName);
    this.stateRepo.update(intentName, state => {
      if (state.integrationOwner?.token !== this.owner?.token) throw new Error("Integration ownership changed.");
      delete state.integrationOwner;
    });
    this.owner = undefined;
  }

  private assertOwner(intentName: string): void {
    if (!this.owner || this.stateRepo.load(intentName)?.integrationOwner?.token !== this.owner.token) {
      throw new Error("Exclusive integration ownership is required.");
    }
  }

  /** Rebuild missing queue entries from approval records after an interruption. */
  enqueueApproved(intentName: string): void {
    this.assertOwner(intentName);
    this.stateRepo.update(intentName, state => {
      const queue = state.integrationQueue ??= [];
      for (const [id, task] of Object.entries(state.tasks)) {
        if (task.status === "completed" && task.resultCommit && task.integration?.status === "pending" && !queue.includes(id)) queue.push(id);
      }
    });
  }

  async drain(intentName: string): Promise<void> {
    this.enqueueApproved(intentName);
    const interrupted = Object.entries(this.stateRepo.load(intentName)!.tasks).find(([, task]) =>
      task.integration?.resolution && task.integration.status !== "succeeded");
    if (interrupted) {
      await this.resumeConflict(intentName, interrupted[0]);
      if (this.stateRepo.load(intentName)!.tasks[interrupted[0]].integration?.status !== "succeeded") return;
    }
    while (true) {
      const state = this.stateRepo.load(intentName)!;
      const taskId = state.integrationQueue!.find(id => {
        const task = state.tasks[id];
        return task?.status === "completed" && task.integration?.status === "pending" &&
          task.dependencies.every(dependency => isTaskIntegrated(state, dependency));
      });
      if (!taskId) return;
      await this.integrate(intentName, taskId);
      if (this.stateRepo.load(intentName)!.tasks[taskId].integration?.resolution?.status === "exhausted") return;
    }
  }

  private accept(intentName: string, taskId: string, operation: ExecutionOperation, head: string, diagnostics: string[]): void {
    const expected = operation.before.headCommit;
    this.stateRepo.updateTask(intentName, taskId, (record, current) => {
      if (current.integrationOwner?.token !== this.owner?.token || current.lastAcceptedCommit !== expected ||
          record.resultCommit !== operation.source?.headCommit) throw new Error("Integration ownership or accepted evidence changed.");
      const saved = current.operations!.find(op => op.id === operation.id)!;
      const now = new Date().toISOString();
      saved.status = "succeeded";
      saved.outcome = { recordedAt: now, after: { ...operation.before, headCommit: head }, diagnostics };
      current.lastAcceptedCommit = head;
      record.integration = { ...record.integration!, status: "succeeded", completedAt: now, acceptedCommit: head };
      (record.stages ??= {}).integration = { ...record.integration };
      current.integrationQueue = current.integrationQueue?.filter(id => id !== taskId);
    });
  }

  private async resumeConflict(intentName: string, taskId: string): Promise<void> {
    this.assertOwner(intentName);
    if (!this.conflicts) return;
    const state = this.stateRepo.load(intentName)!;
    const resolution = state.tasks[taskId].integration!.resolution!;
    if (resolution.status === "exhausted") return;
    const operation = state.operations?.find(op => op.id === resolution.id);
    if (!operation) throw new Error("Conflict has no persisted integration operation.");
    const head = await this.conflicts.resolve(intentName, taskId);
    if (head) this.accept(intentName, taskId, operation, head,
      this.stateRepo.load(intentName)!.tasks[taskId].integration!.resolution!.diagnostics);
  }

  private async integrate(intentName: string, taskId: string): Promise<void> {
    this.assertOwner(intentName);
    const state = this.stateRepo.load(intentName)!;
    const task = state.tasks[taskId];
    let operation: ExecutionOperation | undefined;
    let before: GitIdentity | undefined;
    try {
      if (!state.runId || !state.repositoryPath || !state.integrationBranch || !state.integrationWorktreePath ||
          !state.lastAcceptedCommit || !task.branch || !task.worktreePath || !task.baseCommit || !task.resultCommit) {
        throw new Error("Approved result or integration Git identity is incomplete.");
      }
      const directory = state.integrationWorktreePath;
      const info = this.git.getRepositoryInfo(directory);
      before = { repositoryPath: state.repositoryPath, branch: state.integrationBranch,
        worktreePath: directory, headCommit: info.head, exists: true };
      if (info.branch !== state.integrationBranch || info.head !== state.lastAcceptedCommit ||
          this.git.getStatus(directory).some(entry => entry.kind !== "ignored") ||
          state.operations?.some(op => op.kind === "integration" && op.status === "intended")) {
        throw new Error("Integration environment differs from accepted evidence; reconcile before integrating.");
      }
      if (!this.git.isAncestor(directory, task.baseCommit, task.resultCommit) ||
          !task.dependencies.every(id => {
            const dependency = state.tasks[id];
            return isTaskIntegrated(state, id) && this.git.isAncestor(directory, dependency.resultCommit!, task.baseCommit!) &&
              this.git.isAncestor(directory, dependency.resultCommit!, state.lastAcceptedCommit!);
          })) throw new Error("Task base or accepted integration does not contain its dependencies.");
      operation = { id: randomUUID(), runId: state.runId, taskId, attempt: task.attempt ?? 0,
        kind: "integration", status: "intended", intendedAt: new Date().toISOString(), owner: this.owner,
        before, source: { repositoryPath: state.repositoryPath, branch: task.branch,
          worktreePath: task.worktreePath, headCommit: task.resultCommit, exists: true },
        expectedAfter: { ...before, headCommit: null } };
      const intended = operation;
      this.stateRepo.updateTask(intentName, taskId, (record, current) => {
        (current.operations ??= []).push(intended);
        record.stage = "integration";
        record.integration = { status: "running", resultCommit: task.resultCommit,
          startedAt: intended.intendedAt, operationId: intended.id };
        (record.stages ??= {}).integration = { ...record.integration };
      });
      let result = this.git.integrate(directory, task.resultCommit);
      if (result.status === "conflicted" && this.conflicts) {
        this.stateRepo.updateTask(intentName, taskId, record => {
          record.integration!.resolution = { id: intended.id, incomingCommit: task.resultCommit!,
            lastAcceptedCommit: state.lastAcceptedCommit!, worktreePath: directory, attempts: 0,
            status: "pending", conflicts: result.conflicts, diagnostics: [result.diagnostics] };
        });
        const head = await this.conflicts.resolve(intentName, taskId);
        if (!head) throw new Error("Automatic conflict resolution exhausted after two attempts; artifacts preserved.");
        result = { ...result, status: "integrated", head, conflicts: [] };
      }
      const after = this.git.getRepositoryInfo(directory);
      if (result.status !== "integrated" || !after.head || after.branch !== state.integrationBranch || after.head !== result.head ||
          this.git.getStatus(directory).some(entry => entry.kind !== "ignored") ||
          !this.git.isAncestor(directory, state.lastAcceptedCommit, after.head) ||
          !this.git.isAncestor(directory, task.resultCommit, after.head)) {
        throw new Error("Git integration did not produce a clean accepted result. " + result.diagnostics);
      }
      this.accept(intentName, taskId, intended, after.head,
        this.stateRepo.load(intentName)!.tasks[taskId].integration?.resolution?.diagnostics ?? [result.diagnostics]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let after: GitIdentity | undefined;
      if (operation && before) {
        try { after = { ...before, headCommit: this.git.getRepositoryInfo(before.worktreePath).head }; } catch { /* Preserve intent when inspection fails. */ }
      }
      this.stateRepo.updateTask(intentName, taskId, (record, current) => {
        const now = new Date().toISOString();
        const saved = current.operations?.find(op => op.id === operation?.id);
        if (saved?.status === "intended" && after) {
          saved.status = "failed";
          saved.outcome = { recordedAt: now, after, diagnostics: [message] };
        }
        record.integration = { ...record.integration, status: "blocked", completedAt: now };
        (record.stages ??= {}).integration = { ...record.integration };
        (record.diagnostics ??= []).push({ stage: "integration", message, recordedAt: now, operationId: operation?.id });
      });
    }
  }
}
