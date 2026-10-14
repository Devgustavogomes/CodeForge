import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { lstatSync, readFileSync } from "node:fs";
import { ExecutionOperation, GitIdentity, IntentExecutionState, isTaskIntegrated, ProcessOwnership } from "../domain/execution.js";
import { DirectoryGitGateway } from "../infrastructure/git/GitGateway.js";
import { ProcessExecutor } from "../infrastructure/process/ProcessExecutor.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";

export type RecoveryGit = Pick<DirectoryGitGateway, "getRepositoryInfo" | "listWorktrees" | "getStatus" |
  "getConflicts" | "getCommitMessage" | "isAncestor">;
export interface RecoveryResult { ready: boolean; reason?: string }

/** A live PID is deliberately conservative: PID reuse cannot establish that ownership is stale. */
export function inspectRecoveryOwner(owner: ProcessOwnership): boolean {
  if (owner.host !== os.hostname()) return false;
  return [owner.pid, ...(owner.childPids ?? [])].every(pid => {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return false; }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
  });
}

/** Read Git and OS evidence before changing scheduling state. Never repair Git by reset or removal. */
export class ExecutionRecoveryCoordinator {
  constructor(private readonly repo: ExecutionStateRepository, private readonly git: RecoveryGit,
    private readonly processes: ProcessExecutor,
    private readonly ownerInactive: (owner: ProcessOwnership) => boolean | Promise<boolean> = inspectRecoveryOwner) {}

  async reconcile(intentName: string): Promise<RecoveryResult> {
    const snapshot = this.repo.load(intentName);
    if (!snapshot) return { ready: true };
    if (snapshot.recovery) return { ready: false, reason: "Legacy execution requires recorded Git ownership evidence before recovery." };
    // Inspect every launch, including exited parents with surviving descendants and launching records.
    const checks = await Promise.all((snapshot.processes ?? []).map(async record => ({ record,
      check: await this.processes.inspect(record).catch(error => ({ safeToReuse: false,
        status: "unknown" as const, processes: [], diagnostics: [String(error)] })) })));
    // Operation owners are historical once the coordinator has persisted release of its lease.
    const owners = [snapshot.owner, snapshot.integrationOwner, ...Object.values(snapshot.tasks).map(task => task.owner)]
      .filter((owner): owner is ProcessOwnership => !!owner);
    const inactive = await Promise.all(owners.map(owner => Promise.resolve(this.ownerInactive(owner)).catch(() => false)));
    if (checks.some(({ check }) => !check.safeToReuse || check.status === "active" || check.processes.length) || inactive.some(value => !value)) {
      return { ready: false, reason: "Previous agents, subprocesses or integration owners remain live or cannot be identified; preserve exclusive ownership and worktrees." };
    }
    const next = structuredClone(snapshot);
    const now = new Date().toISOString();
    const failures: string[] = [];
    delete next.owner;
    delete next.integrationOwner;
    for (const task of Object.values(next.tasks)) delete task.owner;
    for (const { record } of checks) {
      const saved = next.processes!.find(item => item.id === record.id)!;
      if (saved.status === "running" || saved.status === "launching") {
        saved.status = "interrupted"; saved.endedAt = now; saved.exitCode = null;
        saved.diagnostics.push("Startup recovery found no owned processes; the previous promise is unavailable.");
      }
    }
    const diagnostic = (message: string, operation?: ExecutionOperation) => {
      failures.push(message);
      const entry = { stage: "recovery" as const, message, recordedAt: now, operationId: operation?.id };
      (next.diagnostics ??= []).push(entry);
      const task = operation?.taskId ? next.tasks[operation.taskId] : undefined;
      if (task) {
        (task.diagnostics ??= []).push(entry);
        if (operation?.kind === "integration") task.integration = { ...task.integration, status: "blocked" };
        else if (task.status !== "completed") {
          task.status = "failed";
          (task.stages ??= {})[task.stage ?? "execution"] = { ...task.stages?.[task.stage ?? "execution"], status: "blocked" };
        }
      }
    };
    try {
      for (const operation of [...(next.operations ?? [])]) {
        if (operation.runId !== next.runId) throw new Error("Operation run identity differs from persisted ownership.");
        if (operation.status === "failed" && operation.kind === "integration" && operation.outcome?.after.headCommit &&
            operation.outcome.after.headCommit !== operation.before.headCommit &&
            next.tasks[operation.taskId!]?.integration?.status !== "succeeded" &&
            (!next.tasks[operation.taskId!]?.integration?.resolution ||
              next.tasks[operation.taskId!]?.integration?.resolution?.status === "succeeded")) {
          // A caught state-write failure can record failure after Git already merged. Keep that immutable
          // diagnostic record and append recovered acceptance evidence rather than rewriting history.
          const recovered: ExecutionOperation = { ...operation, id: randomUUID(), status: "intended", intendedAt: now };
          delete recovered.outcome;
          try {
            this.reconcileOperation(next, recovered, now);
            if (recovered.status === "succeeded") (next.operations ??= []).push(recovered);
          } catch (error) { diagnostic(String(error), operation); }
          continue;
        }
        if (operation.status !== "intended") continue;
        try { this.reconcileOperation(next, operation, now); }
        catch (error) { diagnostic(String(error), operation); }
      }
      if (next.repositoryPath) {
        const common = this.git.getRepositoryInfo(next.repositoryPath).commonDirectory;
        if (this.present(path.join(common, "codeforge-integration.lock"))) {
          throw new Error("Git integration command lock has unresolved ownership; preserve it for manual reconciliation.");
        }
        for (const operation of next.operations ?? []) {
          if (operation.kind === "worktree" && operation.status === "intended" &&
              this.present(path.join(common, operation.expectedAfter.branch.slice("codex/".length) + ".preparation.lock"))) {
            throw new Error("Preparation command lock has unresolved ownership; preserve it for manual reconciliation.");
          }
        }
      }
      // Verify the current accepted ref even when there is no interrupted operation.
      if (next.integrationWorktreePath && next.integrationBranch && next.lastAcceptedCommit && next.delivery?.status !== "succeeded") {
        const info = this.inspect(next, { repositoryPath: next.repositoryPath!, branch: next.integrationBranch,
          worktreePath: next.integrationWorktreePath, headCommit: next.lastAcceptedCommit });
        const resolving = Object.values(next.tasks).some(task => task.integration?.resolution && task.integration.status !== "succeeded");
        if (!resolving && (info.head !== next.lastAcceptedCommit || !this.clean(next.integrationWorktreePath))) {
          throw new Error("Integration differs from the last accepted reference; artifacts preserved.");
        }
        for (const [id, task] of Object.entries(next.tasks)) {
          if (isTaskIntegrated(next, id) && (!this.git.isAncestor(info.directory, task.integration!.acceptedCommit!, next.lastAcceptedCommit) ||
              !this.git.isAncestor(info.directory, task.resultCommit!, task.integration!.acceptedCommit!))) {
            throw new Error("Accepted integration history is inconsistent for " + id);
          }
        }
      }
    } catch (error) { diagnostic(String(error)); }
    for (const [id, task] of Object.entries(next.tasks)) {
      const resolution = task.integration?.resolution;
      if (resolution?.status === "running") {
        resolution.status = resolution.attempts >= 2 ? "exhausted" : "failed";
        resolution.diagnostics.push("Previous conflict resolution attempt was interrupted; files and consumed budget preserved.");
        task.integration!.status = resolution.status === "exhausted" ? "blocked" : "pending";
        (task.stages ??= {}).integration = { ...task.integration! };
      }
      if (task.status === "running") {
        task.status = "pending";
        const stage = task.stage ?? "execution";
        if (!task.stages?.[stage] || task.stages[stage]!.status === "running") {
          (task.stages ??= {})[stage] = { ...task.stages?.[stage], status: "pending" };
        }
        (task.diagnostics ??= []).push({ stage: "recovery", recordedAt: now, attempt: task.attempt,
          message: "Execution interrupted; resume in the existing worktree with preserved files." });
      }
      if (task.status === "completed" && task.resultCommit && task.integration?.status === "pending") {
        const queue = next.integrationQueue ??= [];
        if (!queue.includes(id)) queue.push(id);
      }
    }
    next.integrationQueue = [...new Set(next.integrationQueue ?? [])].filter(id => !isTaskIntegrated(next, id));
    if (failures.length) next.status = "paused";
    // Never reconcile a snapshot over launches or ownership acquired during OS inspection.
    this.repo.update(intentName, current => {
      if (current.revision !== snapshot.revision) throw new Error("Execution changed during startup recovery; reload before resuming.");
      Object.assign(current, next);
      delete current.owner;
      delete current.integrationOwner;
    });
    return failures.length ? { ready: false, reason: failures.join(" ") } : { ready: true };
  }

  private clean(cwd: string): boolean {
    const info = this.git.getRepositoryInfo(cwd);
    return !this.git.getConflicts(cwd).length && this.git.getStatus(cwd).every(entry => entry.kind === "ignored") &&
      !["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"].some(name => this.present(path.join(info.gitDirectory, name)));
  }

  private present(file: string): boolean {
    try { lstatSync(file); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  }

  private inspect(state: IntentExecutionState, identity: GitIdentity) {
    if (!state.repositoryPath || identity.repositoryPath !== state.repositoryPath) throw new Error("Repository ownership mismatch.");
    const repository = this.git.getRepositoryInfo(state.repositoryPath);
    const registered = this.git.listWorktrees(state.repositoryPath).find(item => path.resolve(item.directory) === path.resolve(identity.worktreePath));
    const info = this.git.getRepositoryInfo(identity.worktreePath);
    if (!registered || registered.locked || registered.prunable || registered.branch !== identity.branch ||
        registered.head !== info.head || info.branch !== identity.branch || info.commonDirectory !== repository.commonDirectory ||
        path.resolve(info.directory) !== path.resolve(identity.worktreePath) || !info.head) throw new Error("Worktree ownership or registration changed; preserve artifacts.");
    return info;
  }

  private reconcileOperation(state: IntentExecutionState, op: ExecutionOperation, now: string): void {
    const task = op.taskId ? state.tasks[op.taskId] : undefined;
    const expectedBranch = op.kind === "delivery" ? state.originalBranch : op.kind === "integration" ? state.integrationBranch : task?.branch ?? state.integrationBranch;
    const expectedPath = op.kind === "delivery" ? state.originalWorktreePath : op.kind === "integration" ? state.integrationWorktreePath : task?.worktreePath ?? state.integrationWorktreePath;
    if (op.taskId && !task || op.before.repositoryPath !== state.repositoryPath ||
        op.expectedAfter.repositoryPath !== state.repositoryPath || op.before.branch !== expectedBranch ||
        op.expectedAfter.branch !== expectedBranch || op.before.worktreePath !== expectedPath ||
        op.expectedAfter.worktreePath !== expectedPath) throw new Error("Operation artifact identity differs from persisted ownership.");
    const succeed = (after: GitIdentity) => { op.status = "succeeded"; op.outcome = { recordedAt: now, after }; };
    const fail = (after: GitIdentity) => { op.status = "failed"; op.outcome = { recordedAt: now, after,
      diagnostics: ["Interrupted before completing the Git side effect; existing files preserved."] }; };
    if (op.kind === "cleanup") {
      if (state.delivery?.status !== "succeeded" || !state.delivery.deliveredCommit || op.expectedAfter.exists !== false ||
          !op.before.headCommit || !this.git.isAncestor(state.repositoryPath!, op.before.headCommit, state.delivery.deliveredCommit) ||
          !this.git.isAncestor(state.repositoryPath!, op.before.headCommit, "refs/heads/" + op.before.branch) ||
          !this.git.isAncestor(state.repositoryPath!, "refs/heads/" + op.before.branch, op.before.headCommit)) throw new Error("Cleanup lacks delivered and preserved commit evidence.");
      const registered = this.git.listWorktrees(state.repositoryPath!).some(item => path.resolve(item.directory) === path.resolve(op.before.worktreePath));
      if (!registered && !this.present(op.before.worktreePath)) {
        succeed({ ...op.expectedAfter, exists: false });
        const record = { status: "succeeded" as const, branch: op.before.branch, worktreePath: op.before.worktreePath,
          preservedCommit: op.before.headCommit, operationId: op.id, completedAt: now };
        if (task) task.cleanup = record;
        const records = state.cleanup ??= [];
        const index = records.findIndex(item => item.worktreePath === record.worktreePath && item.branch === record.branch);
        if (index < 0) records.push(record); else records[index] = record;
      } else this.inspect(state, op.before);
      return;
    }
    const target = op.kind === "worktree" ? op.expectedAfter : op.before;
    if (op.kind === "worktree" && !this.git.listWorktrees(state.repositoryPath!).some(item => path.resolve(item.directory) === path.resolve(target.worktreePath))) {
      if (this.present(target.worktreePath)) throw new Error("Unregistered creation artifacts are ambiguous; preserve them.");
      return; // Lifecycle resumes the reserved branch/path without creating a second identity.
    }
    const info = this.inspect(state, target);
    const after = { ...target, headCommit: info.head, exists: true };
    if (op.kind === "worktree") {
      if (!target.headCommit || !this.git.isAncestor(info.directory, target.headCommit, info.head!)) throw new Error("Created worktree differs from its fixed base.");
      const preparation = state.processes?.filter(record => record.cwd === target.worktreePath && record.kind === "preparation" &&
        record.startedAt >= op.intendedAt).at(-1);
      if (preparation?.status === "exited" && preparation.exitCode === 0 && preparation.command === "npm ci") {
        succeed(after);
        if (task) (task.stages ??= {}).preparation = { status: "succeeded", completedAt: now, operationId: op.id };
      }
      return;
    }
    if (op.kind === "commit") {
      if (!task || task.branch !== target.branch || task.worktreePath !== target.worktreePath ||
          task.stages?.verification?.status !== "succeeded" || !task.baseCommit ||
          !this.git.isAncestor(info.directory, task.baseCommit, info.head!)) throw new Error("Interrupted commit has no matching ownership or gate approval.");
      const noChange = op.expectedAfter.headCommit === op.before.headCommit;
      const marker = this.git.getCommitMessage(info.directory, info.head!).split(/\r?\n/).includes("CodeForge-Operation: " + op.id);
      if (this.clean(info.directory) && (noChange ? info.head === op.before.headCommit : marker &&
          !!op.before.headCommit && this.git.isAncestor(info.directory, op.before.headCommit, info.head!))) {
        succeed(after); task.resultCommit = info.head!; task.status = "completed"; task.completedAt = now;
        (task.stages ??= {}).commit = { status: "succeeded", completedAt: now, operationId: op.id };
        task.integration = { status: "pending", resultCommit: info.head! };
      } else if (info.head === op.before.headCommit && !noChange) {
        fail(after); task.status = "pending";
      } else throw new Error("Interrupted commit evidence is ambiguous; agent reuse blocked.");
      return;
    }
    if (op.kind === "integration") {
      if (!task || task.status !== "completed" || !task.baseCommit ||
          !this.git.isAncestor(info.directory, task.baseCommit, task.resultCommit!) ||
          task.resultCommit !== op.source?.headCommit || op.source?.branch !== task.branch ||
          op.source?.worktreePath !== task.worktreePath || op.source?.repositoryPath !== state.repositoryPath ||
          op.before.headCommit !== state.lastAcceptedCommit ||
          target.branch !== state.integrationBranch || target.worktreePath !== state.integrationWorktreePath ||
          !task.dependencies.every(id => isTaskIntegrated(state, id))) throw new Error("Integration intent differs from accepted history or dependencies.");
      const resolution = task.integration?.resolution;
      if (this.clean(info.directory) && this.git.isAncestor(info.directory, state.lastAcceptedCommit!, info.head!) &&
          this.git.isAncestor(info.directory, task.resultCommit!, info.head!) && (!resolution || resolution.status === "succeeded" && resolution.resolvedCommit === info.head)) {
        succeed(after); state.lastAcceptedCommit = info.head!;
        task.integration = { ...task.integration, status: "succeeded", resultCommit: task.resultCommit,
          acceptedCommit: info.head!, completedAt: now, operationId: op.id };
        (task.stages ??= {}).integration = { ...task.integration };
      } else if (resolution) {
        if (resolution.status === "succeeded") throw new Error("Approved conflict resolution no longer matches clean Git evidence.");
        task.integration!.status = resolution.status === "exhausted" ? "blocked" : "pending";
        if (!this.git.isAncestor(info.directory, resolution.lastAcceptedCommit, info.head!)) throw new Error("Conflict work lost its last accepted reference.");
      } else if (this.git.getConflicts(info.directory).length && info.head === state.lastAcceptedCommit &&
          readFileSync(path.join(info.gitDirectory, "MERGE_HEAD"), "utf8").trim() === task.resultCommit) {
        task.integration = { ...task.integration, status: "pending", resultCommit: task.resultCommit, operationId: op.id,
          resolution: { id: op.id, incomingCommit: task.resultCommit!, lastAcceptedCommit: state.lastAcceptedCommit!,
            worktreePath: info.directory, attempts: 0, status: "pending", conflicts: this.git.getConflicts(info.directory),
            diagnostics: ["Interrupted merge conflicts recovered; files preserved."] } };
      } else if (info.head === op.before.headCommit && this.clean(info.directory)) {
        fail(after); task.integration = { status: "pending", resultCommit: task.resultCommit };
      } else throw new Error("Interrupted integration is ambiguous; preserve the last accepted reference.");
      return;
    }
    if (op.kind === "delivery") {
      if (!Object.keys(state.tasks).length || op.before.headCommit !== state.originalCommit ||
          op.source?.repositoryPath !== state.repositoryPath || op.source?.branch !== state.integrationBranch ||
          op.source?.worktreePath !== state.integrationWorktreePath ||
          target.branch !== state.originalBranch || target.worktreePath !== state.originalWorktreePath ||
          op.expectedAfter.headCommit !== state.lastAcceptedCommit || op.source?.headCommit !== state.lastAcceptedCommit ||
          !Object.keys(state.tasks).every(id => isTaskIntegrated(state, id))) throw new Error("Delivery does not match the complete accepted result.");
      if (info.head === op.expectedAfter.headCommit && this.git.isAncestor(info.directory, state.lastAcceptedCommit!, "refs/heads/" + state.originalBranch)) {
        succeed(after); state.delivery = { ...state.delivery, status: "succeeded", operationId: op.id,
          originalCommit: state.originalCommit, resultCommit: state.lastAcceptedCommit, deliveredCommit: info.head!, completedAt: now };
      } else if (info.head === op.before.headCommit) {
        fail(after); state.delivery = { ...state.delivery, status: "pending" };
      } else throw new Error("Delivery checkout changed; retain the integration result for manual reconciliation.");
    }
  }
}
