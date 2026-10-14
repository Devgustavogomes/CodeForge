import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { CleanupRecord, ExecutionOperation, IntentExecutionState, isTaskIntegrated } from "../domain/execution.js";
import { DirectoryGitGateway, OwnedWorktree } from "../infrastructure/git/GitGateway.js";
import { PATHS } from "../infrastructure/paths.js";
import { ProcessExecutor } from "../infrastructure/process/ProcessExecutor.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";

export type CleanupGit = Pick<DirectoryGitGateway, "getRepositoryInfo" | "listWorktrees" | "getStatus" |
  "getConflicts" | "isAncestor" | "removeWorktree">;

/** Cleanup is recoverable bookkeeping; it never changes delivery or deletes refs. */
export class CleanupCoordinator {
  constructor(private readonly stateRepo: ExecutionStateRepository, private readonly git: CleanupGit,
    private readonly processes: ProcessExecutor) {}

  async cleanup(intentName: string): Promise<{ failures: string[] }> {
    const failures: string[] = [];
    const initial = this.stateRepo.load(intentName);
    if (initial?.delivery?.status !== "succeeded") return { failures };
    try {
      this.delivered(initial);
      const common = this.git.getRepositoryInfo(initial.repositoryPath!).commonDirectory;
      if (realpathSync(common) !== path.resolve(common)) throw new Error("Repository directory is redirected; preserve cleanup artifacts.");
      // Task artifacts are independent; an ineligible artifact must not prevent other safe cleanup.
      for (const taskId of [...Object.keys(initial.tasks), undefined]) {
        let operation: ExecutionOperation | undefined;
        let owned: OwnedWorktree | undefined;
        try {
          const state = this.stateRepo.load(intentName)!;
          this.delivered(state);
          if (state.runId !== initial.runId) throw new Error("Run identity changed during cleanup.");
          owned = this.owned(state, taskId, common);
          const head = taskId === undefined ? state.lastAcceptedCommit! : state.tasks[taskId].resultCommit!;
          const before = { repositoryPath: state.repositoryPath!, branch: owned.branch,
            worktreePath: owned.directory, headCommit: head, exists: true };
          const previous = state.operations?.filter(op => op.kind === "cleanup" && op.runId === state.runId &&
            op.taskId === taskId && op.before.repositoryPath === before.repositoryPath &&
            op.before.branch === before.branch && op.before.worktreePath === before.worktreePath &&
            op.before.headCommit === head && op.expectedAfter.exists === false &&
            op.expectedAfter.repositoryPath === before.repositoryPath && op.expectedAfter.branch === before.branch &&
            op.expectedAfter.worktreePath === before.worktreePath && op.expectedAfter.headCommit === head).at(-1);
          const absent = this.inspect(state, owned, head, common);
          if (absent) {
            if (!previous) throw new Error("Missing worktree has no matching cleanup evidence; reconcile before retrying.");
            operation = previous;
          } else {
            if (previous?.status === "succeeded") throw new Error("A removed artifact has reappeared; preserve it for manual reconciliation.");
            await this.inactive(intentName, state, owned, taskId);
            const latest = this.stateRepo.load(intentName)!;
            if (JSON.stringify(latest) !== JSON.stringify(state)) throw new Error("Execution evidence changed during process inspection; retry cleanup.");
            operation = previous?.status === "intended" ? previous : {
              id: randomUUID(), runId: state.runId!, taskId, attempt: taskId === undefined ? 0 : state.tasks[taskId].attempt ?? 0,
              kind: "cleanup", status: "intended", intendedAt: new Date().toISOString(), before,
              expectedAfter: { ...before, exists: false },
            };
            const intended = operation;
            this.stateRepo.update(intentName, current => {
              if (JSON.stringify(current) !== JSON.stringify(latest)) throw new Error("Cleanup evidence changed before removal.");
              if (intended !== previous) (current.operations ??= []).push(intended);
              this.progress(current, taskId, { status: "running", branch: owned!.branch, worktreePath: owned!.directory,
                preservedCommit: head, operationId: intended.id, startedAt: intended.intendedAt });
            });
            // Revalidate after recording intent; the gateway also guards Git removal without force.
            const current = this.stateRepo.load(intentName)!;
            this.delivered(current);
            const currentOwned = this.owned(current, taskId, common);
            if (currentOwned.directory !== owned.directory || currentOwned.branch !== owned.branch ||
                this.inspect(current, owned, head, common)) throw new Error("Worktree changed before cleanup.");
            await this.inactive(intentName, current, owned, taskId);
            if (JSON.stringify(this.stateRepo.load(intentName)) !== JSON.stringify(current)) throw new Error("Process evidence changed before removal.");
            this.git.removeWorktree(state.repositoryPath!, owned, state.delivery!.deliveredCommit!, true);
            if (!this.inspect(this.stateRepo.load(intentName)!, owned, head, common)) throw new Error("Worktree removal could not be verified.");
          }
          const completedAt = new Date().toISOString();
          const completed = operation;
          this.stateRepo.update(intentName, current => {
            const saved = current.operations!.find(op => op.id === completed!.id)!;
            if (saved.status !== "succeeded") {
              saved.status = "succeeded";
              saved.outcome = { recordedAt: completedAt, after: { ...saved.expectedAfter, exists: false } };
            }
            this.progress(current, taskId, { status: "succeeded", branch: owned!.branch, worktreePath: owned!.directory,
              preservedCommit: head, operationId: saved.id, completedAt: saved.outcome!.recordedAt });
          });
        } catch (error) {
          const message = (taskId ?? "integration") + ": " + (error instanceof Error ? error.message : String(error));
          failures.push(message);
          this.diagnostic(intentName, message, taskId, owned, operation);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(message);
      this.diagnostic(intentName, message);
    }
    return { failures };
  }

  private delivered(state: IntentExecutionState): void {
    const commit = state.delivery?.deliveredCommit;
    const evidence = state.operations?.find(op => op.id === state.delivery?.operationId && op.kind === "delivery" && op.status === "succeeded");
    if (!state.runId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(state.runId) || !state.repositoryPath ||
        !state.originalWorktreePath || !state.originalBranch || !commit || state.delivery?.status !== "succeeded" ||
        commit !== state.lastAcceptedCommit || state.recovery || state.reviewError || state.status === "failed" ||
        !Object.keys(state.tasks).length || !Object.keys(state.tasks).every(id => isTaskIntegrated(state, id)) ||
        state.integrationQueue?.length || state.operations?.some(op => op.kind !== "cleanup" && op.status === "intended") ||
        !evidence || evidence.runId !== state.runId || evidence.before.headCommit !== state.originalCommit ||
        evidence.before.repositoryPath !== state.repositoryPath || evidence.before.branch !== state.originalBranch ||
        evidence.before.worktreePath !== state.originalWorktreePath ||
        evidence.expectedAfter.repositoryPath !== state.repositoryPath || evidence.expectedAfter.headCommit !== commit || evidence.expectedAfter.branch !== state.originalBranch ||
        evidence.expectedAfter.worktreePath !== state.originalWorktreePath ||
        evidence.source?.repositoryPath !== state.repositoryPath || evidence.source?.branch !== state.integrationBranch || evidence.source?.worktreePath !== state.integrationWorktreePath ||
        evidence.source?.headCommit !== commit || evidence.outcome?.after.headCommit !== commit ||
        evidence.outcome.after.repositoryPath !== state.repositoryPath || evidence.outcome.after.branch !== state.originalBranch ||
        evidence.outcome.after.worktreePath !== state.originalWorktreePath ||
        !this.git.isAncestor(state.repositoryPath, commit, "refs/heads/" + state.originalBranch)) {
      throw new Error("Verified successful delivery and unchanged run evidence are required for cleanup.");
    }
  }

  private owned(state: IntentExecutionState, taskId: string | undefined, common: string): OwnedWorktree {
    const task = taskId === undefined ? undefined : state.tasks[taskId];
    const branch = task?.branch ?? (taskId === undefined ? state.integrationBranch : undefined);
    const directory = task?.worktreePath ?? (taskId === undefined ? state.integrationWorktreePath : undefined);
    const base = task?.baseCommit ?? (taskId === undefined ? state.originalCommit : undefined);
    const token = branch?.slice("codex/".length);
    const duplicate = Object.entries(state.tasks).some(([id, record]) => id !== taskId &&
      (record.branch === branch || record.worktreePath && directory && path.resolve(record.worktreePath) === path.resolve(directory))) ||
      taskId !== undefined && (state.integrationBranch === branch || state.integrationWorktreePath && directory &&
        path.resolve(state.integrationWorktreePath) === path.resolve(directory));
    const creation = state.operations?.find(op => op.kind === "worktree" && op.status === "succeeded" &&
      op.runId === state.runId && op.taskId === taskId && op.expectedAfter.repositoryPath === state.repositoryPath &&
      op.expectedAfter.branch === branch && op.expectedAfter.worktreePath === directory && op.expectedAfter.headCommit === base &&
      op.expectedAfter.exists === true && op.outcome?.after.repositoryPath === state.repositoryPath &&
      op.outcome.after.branch === branch && op.outcome.after.worktreePath === directory && op.outcome.after.exists === true);
    if (taskId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(taskId) ||
        !branch?.startsWith("codex/" + state.runId + "-" + (taskId ?? "integration") + "-") ||
        !token || !/^[A-Za-z0-9_-]+$/.test(token) || !directory || !base || !creation || duplicate ||
        path.resolve(directory) !== path.join(common, PATHS.worktreesDir, token) ||
        task?.integration?.resolution && task.integration.resolution.status !== "succeeded" ||
        task?.stages && Object.values(task.stages).some(stage => stage.status !== "succeeded") ||
        taskId === undefined && Object.values(state.tasks).some(record => record.integration?.resolution &&
          record.integration.resolution.status !== "succeeded")) {
      throw new Error("Worktree ownership or task completion evidence is incomplete or mismatched.");
    }
    return { branch, directory, baseCommit: base };
  }

  private inspect(state: IntentExecutionState, owned: OwnedWorktree, head: string, common: string): boolean {
    const root = path.join(common, PATHS.worktreesDir);
    if (realpathSync(root) !== path.resolve(root)) throw new Error("Managed worktree root is redirected.");
    const registered = this.git.listWorktrees(state.repositoryPath!).find(item => path.resolve(item.directory) === path.resolve(owned.directory));
    // lstat also detects dangling links and foreign paths after an interrupted removal.
    let present = true;
    try { lstatSync(owned.directory); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      present = false;
    }
    if (!this.git.isAncestor(state.repositoryPath!, owned.baseCommit, head) ||
        !this.git.isAncestor(state.repositoryPath!, head, state.delivery!.deliveredCommit!) ||
        !this.git.isAncestor(state.repositoryPath!, head, "refs/heads/" + owned.branch) ||
        !this.git.isAncestor(state.repositoryPath!, "refs/heads/" + owned.branch, head)) {
      throw new Error("Artifact branch or result is not preserved in the delivered history.");
    }
    if (!registered && !present) return true;
    if (!registered || !present || registered.locked || registered.prunable || registered.branch !== owned.branch || registered.head !== head ||
        realpathSync(owned.directory) !== path.resolve(owned.directory)) throw new Error("Worktree registration or canonical path changed.");
    const info = this.git.getRepositoryInfo(owned.directory);
    if (info.commonDirectory !== common || path.resolve(info.directory) !== path.resolve(owned.directory) ||
        info.branch !== owned.branch || info.head !== head || this.git.getConflicts(owned.directory).length ||
        this.git.getStatus(owned.directory).some(entry => entry.kind !== "ignored")) {
      throw new Error("Worktree has changed identity, conflicts, or pending files; preserve it.");
    }
    return false;
  }

  private async inactive(intentName: string, state: IntentExecutionState, owned: OwnedWorktree, taskId?: string): Promise<void> {
    const normalize = (directory: string) => process.platform === "win32" ? path.resolve(directory).toLowerCase() : path.resolve(directory);
    const records = state.processes?.filter(record => normalize(record.cwd) === normalize(owned.directory)) ?? [];
    const owners = [taskId === undefined ? undefined : state.tasks[taskId].owner,
      ...[state.owner, state.integrationOwner].filter(owner => owner?.worktreePath && normalize(owner.worktreePath) === normalize(owned.directory))];
    if (owners.some(owner => owner && !records.some(record => record.token === owner.token && record.host === owner.host))) {
      throw new Error("Process ownership has no matching inspection evidence; preserve the worktree.");
    }
    const inspection = await this.stateRepo.inspectEnvironment(intentName, this.processes, { cwd: owned.directory });
    if (!inspection.safeToReuse || inspection.status === "active" || inspection.processes.length) throw new Error("Worktree process occupancy is unresolved: " + inspection.diagnostics.join(" "));
  }

  private progress(state: IntentExecutionState, taskId: string | undefined, record: CleanupRecord): void {
    const records = state.cleanup ??= [];
    const index = records.findIndex(item => item.branch === record.branch && item.worktreePath === record.worktreePath);
    if (index < 0) records.push(record); else records[index] = record;
    if (taskId !== undefined) state.tasks[taskId].cleanup = record;
  }

  private diagnostic(intentName: string, message: string, taskId?: string, owned?: OwnedWorktree, operation?: ExecutionOperation): void {
    this.stateRepo.update(intentName, current => {
      const recordedAt = new Date().toISOString();
      const diagnostic = { stage: "cleanup" as const, message: message + " Artifacts retained; retry cleanup after reconciliation.",
        recordedAt, operationId: operation?.id };
      (current.diagnostics ??= []).push(diagnostic);
      if (taskId !== undefined) (current.tasks[taskId].diagnostics ??= []).push(diagnostic);
      if (owned) this.progress(current, taskId, { status: "blocked", branch: owned.branch, worktreePath: owned.directory,
        operationId: operation?.id, preservedCommit: operation?.before.headCommit ?? undefined });
      // Keep intended operations retryable: removal may have succeeded before an exception.
    });
  }
}
