import { ConflictResolutionRecord } from "../domain/execution.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";
import { DirectoryGitGateway } from "../infrastructure/git/GitGateway.js";
import { NodeProcessExecutor } from "../infrastructure/process/NodeProcessExecutor.js";

export type ConflictResolutionGit = Pick<DirectoryGitGateway,
  "getRepositoryInfo" | "getStatus" | "getConflicts" | "isAncestor" | "continueIntegration">;

export interface ConflictResolutionActions {
  resolve(intentName: string, taskId: string, cwd: string): Promise<void>;
  verify(intentName: string, taskId: string, cwd: string): Promise<void>;
}

/** Attempts are reserved before launching agents; failed work is never reset or aborted. */
export class ConflictResolutionCoordinator {
  constructor(
    private readonly stateRepo: ExecutionStateRepository,
    private readonly git: ConflictResolutionGit,
    private readonly actions: ConflictResolutionActions,
  ) {}

  async resolve(intentName: string, taskId: string): Promise<string | undefined> {
    let state = this.stateRepo.load(intentName)!;
    const resolution = state.tasks[taskId].integration?.resolution;
    if (!resolution) throw new Error("Persisted conflict identity is required.");
    const owner = state.integrationOwner?.token;
    if (!owner) throw new Error("Exclusive integration ownership is required.");
    const cwd = resolution.worktreePath;
    const assertIdentity = () => {
      state = this.stateRepo.load(intentName)!;
      const current = state.tasks[taskId].integration?.resolution;
      const info = this.git.getRepositoryInfo(cwd);
      if (state.integrationOwner?.token !== owner || current?.id !== resolution.id ||
          state.integrationWorktreePath !== cwd || state.lastAcceptedCommit !== resolution.lastAcceptedCommit ||
          state.tasks[taskId].resultCommit !== resolution.incomingCommit || info.branch !== state.integrationBranch ||
          !info.head || !this.git.isAncestor(cwd, resolution.lastAcceptedCommit, info.head)) {
        throw new Error("Conflict ownership or accepted integration evidence changed.");
      }
      return info;
    };
    assertIdentity();
    if (resolution.status === "succeeded") {
      const info = assertIdentity();
      if (info.head !== resolution.resolvedCommit || this.git.getConflicts(cwd).length || this.git.getStatus(cwd).some(entry => entry.kind !== "ignored") ||
          !this.git.isAncestor(cwd, resolution.incomingCommit, info.head!)) {
        throw new Error("Previously approved resolution no longer matches Git evidence.");
      }
      return info.head!;
    }
    if (state.processes?.some(record => record.cwd === cwd)) {
      const occupancy = await this.stateRepo.inspectEnvironment(intentName, new NodeProcessExecutor(), { cwd });
      if (!occupancy.safeToReuse) throw new Error("Resolver environment is occupied: " + occupancy.diagnostics.join(" "));
    }
    // A running attempt after a crash is already consumed. Keep its artifacts and diagnostics.
    if (resolution.status === "running") this.recordFailure(intentName, taskId, "Previous resolution attempt was interrupted.");
    while (true) {
      assertIdentity();
      const current = state.tasks[taskId].integration!.resolution!;
      if (current.status === "exhausted" || current.attempts >= 2) {
        if (current.status !== "exhausted") this.recordFailure(intentName, taskId, "Automatic conflict resolution budget exhausted.");
        return undefined;
      }
      this.stateRepo.updateTask(intentName, taskId, record => {
        const saved = record.integration!.resolution!;
        saved.attempts += 1;
        saved.status = "running";
        record.integration!.status = "running";
      });
      try {
        await this.actions.resolve(intentName, taskId, cwd);
        assertIdentity();
        const conflicts = this.git.getConflicts(cwd);
        if (conflicts.length) throw new Error("Unresolved Git conflicts: " + conflicts.join(", "));
        await this.actions.verify(intentName, taskId, cwd);
        const info = assertIdentity();
        if (this.git.getConflicts(cwd).length) throw new Error("Git conflicts remain after verification.");
        // An agent may have committed the merge, or a crash may have occurred after finalization.
        const alreadyMerged = this.git.isAncestor(cwd, resolution.incomingCommit, info.head!);
        const head = alreadyMerged && this.git.getStatus(cwd).every(entry => entry.kind === "ignored")
          ? info.head!
          : this.git.continueIntegration(cwd, "CodeForge conflict resolution\n\nCodeForge-Operation: " + resolution.id);
        const after = assertIdentity();
        if (after.head !== head || this.git.getStatus(cwd).some(entry => entry.kind !== "ignored") ||
            !this.git.isAncestor(cwd, resolution.incomingCommit, head)) {
          throw new Error("Resolved integration did not produce a clean merged result.");
        }
        this.stateRepo.updateTask(intentName, taskId, record => {
          record.integration!.resolution!.status = "succeeded";
          record.integration!.resolution!.resolvedCommit = head;
          record.integration!.resolution!.conflicts = [];
        });
        return head;
      } catch (error) {
        this.recordFailure(intentName, taskId, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private recordFailure(intentName: string, taskId: string, message: string): void {
    const resolution = this.stateRepo.load(intentName)!.tasks[taskId].integration!.resolution!;
    let conflicts = resolution.conflicts;
    try { conflicts = this.git.getConflicts(resolution.worktreePath); } catch { /* Retain the last observed conflict list. */ }
    let head: string | null | undefined;
    try { head = this.git.getRepositoryInfo(resolution.worktreePath).head; } catch { /* Preserve the Git intent if inspection fails. */ }
    this.stateRepo.updateTask(intentName, taskId, (record, current) => {
      const saved: ConflictResolutionRecord = record.integration!.resolution!;
      saved.status = saved.attempts >= 2 ? "exhausted" : "failed";
      saved.conflicts = conflicts;
      saved.diagnostics.push(message);
      const now = new Date().toISOString();
      (record.diagnostics ??= []).push({ stage: "integration", message, recordedAt: now,
        attempt: saved.attempts, operationId: saved.id });
      if (saved.status === "exhausted") {
        const operation = current.operations?.find(op => op.id === saved.id);
        if (operation && head !== undefined) {
          operation.status = "failed";
          operation.outcome = { recordedAt: now, after: { ...operation.before, headCommit: head },
            diagnostics: [...saved.diagnostics] };
        }
        record.integration!.status = "blocked";
        record.integration!.completedAt = now;
        (record.stages ??= {}).integration = { ...record.integration! };
      }
    });
  }
}
