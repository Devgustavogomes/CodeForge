import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, realpathSync, unlinkSync } from "node:fs";
import path from "node:path";
import { ExecutionOperation, IntentExecutionState } from "../../domain/execution.js";
import { Task } from "../../domain/task.js";
import { DirectoryGitGateway, OwnedWorktree } from "../git/GitGateway.js";
import { ProcessExecutor } from "../process/ProcessExecutor.js";
import { ExecutionStateRepository } from "../repositories/ExecutionStateRepository.js";
import { PATHS } from "../paths.js";

/** Owns preparation only; commit, integration, delivery and cleanup are separate stages. */
export class WorktreeLifecycle {
  private readonly preparing = new Map<string, Promise<OwnedWorktree>>();

  constructor(
    private readonly git: DirectoryGitGateway,
    private readonly processes: ProcessExecutor,
    private readonly stateRepo: ExecutionStateRepository,
  ) {}

  private identifier(value: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) throw new Error("Invalid worktree identifier: " + value);
  }

  private command(directory: string, args: string[]): string {
    try {
      return execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined,
          GIT_COMMON_DIR: undefined, GIT_OBJECT_DIRECTORY: undefined, GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined } }).trim();
    } catch (error) {
      const failure = error as { stderr?: string; message?: string };
      throw new Error("Worktree Git operation failed: " + (failure.stderr || failure.message), { cause: error });
    }
  }

  validateStartingConditions(directory: string): ReturnType<DirectoryGitGateway["getRepositoryInfo"]> {
    if (!this.git.hasRepository(directory)) throw new Error("A Git repository is required to start a run.");
    const info = this.git.getRepositoryInfo(directory);
    if (!info.branch || !info.head) throw new Error("A named original branch with a HEAD commit is required; attach HEAD and commit before starting.");
    this.command(directory, ["check-ref-format", "refs/heads/" + info.branch]);
    if (this.command(directory, ["rev-parse", "--verify", "refs/heads/" + info.branch]) !== info.head) {
      throw new Error("The original branch does not identify HEAD.");
    }
    if (this.git.getStatus(directory).some(entry => entry.kind !== "ignored")) {
      throw new Error("A clean checkout is required. Commit or remove staged, unstaged and nonignored untracked changes before starting.");
    }
    return info;
  }

  async initializeRun(intentName: string, tasks: Task[], directory: string): Promise<IntentExecutionState> {
    if (!this.stateRepo.load(intentName)) {
      // No state or Git mutation until all original checkout checks pass.
      const original = this.validateStartingConditions(directory);
      for (const task of tasks) this.identifier(task.id);
      const state = this.stateRepo.init(intentName, tasks);
      state.repositoryPath = original.directory;
      state.originalWorktreePath = path.resolve(directory);
      state.originalBranch = original.branch!;
      state.originalCommit = original.head!;
      state.lastAcceptedCommit = original.head!;
      this.stateRepo.save(state);
    }
    await this.prepareIntegration(intentName);
    return this.stateRepo.load(intentName)!;
  }

  prepareIntegration(intentName: string): Promise<OwnedWorktree> {
    const state = this.stateRepo.load(intentName);
    if (!state?.originalCommit) return Promise.reject(new Error("Original Git identity is missing; inspect the run before recovery."));
    return this.prepare(intentName, undefined, state.originalCommit);
  }

  getIntegrationCommit(intentName: string): string {
    const state = this.stateRepo.load(intentName);
    if (!state?.integrationWorktreePath || !state.integrationBranch) throw new Error("Integration environment is not prepared.");
    const info = this.git.getRepositoryInfo(state.integrationWorktreePath);
    if (info.branch !== state.integrationBranch || !info.head || info.head !== state.lastAcceptedCommit) {
      throw new Error("Integration HEAD differs from the accepted commit; reconcile integration before preparing tasks.");
    }
    return info.head;
  }

  prepareTask(intentName: string, taskId: string, integrationCommit: string): Promise<OwnedWorktree> {
    this.identifier(taskId);
    const state = this.stateRepo.load(intentName);
    if (!state?.tasks[taskId]) return Promise.reject(new Error("Task execution state not found: " + taskId));
    // Retry retains the recorded base even after the integration branch advances.
    return this.prepare(intentName, taskId, state.tasks[taskId].baseCommit ?? integrationCommit);
  }

  private prepare(intentName: string, taskId: string | undefined, base: string): Promise<OwnedWorktree> {
    const key = intentName + ":" + (taskId ?? "integration");
    const pending = this.preparing.get(key);
    if (pending) return pending;
    const promise = this.prepareEnvironment(intentName, taskId, base).finally(() => this.preparing.delete(key));
    this.preparing.set(key, promise);
    return promise;
  }

  private async prepareEnvironment(intentName: string, taskId: string | undefined, base: string): Promise<OwnedWorktree> {
    const state = this.stateRepo.load(intentName);
    if (!state?.runId || !state.repositoryPath || state.recovery || !state.originalBranch || !state.originalCommit) {
      throw new Error("Run Git ownership is missing; inspect persisted evidence before recovery.");
    }
    this.identifier(state.runId);
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(base)) throw new Error("An explicit integration commit is required.");
    const repository = state.repositoryPath;
    const common = this.git.getRepositoryInfo(repository).commonDirectory;
    if (this.command(repository, ["rev-parse", "--verify", "--end-of-options", base + "^{commit}"]) !== base) {
      throw new Error("The fixed base must identify a commit.");
    }
    const record = taskId ? state.tasks[taskId] : undefined;
    let branch = record?.branch ?? (taskId ? undefined : state.integrationBranch);
    let directory = record?.worktreePath ?? (taskId ? undefined : state.integrationWorktreePath);
    const prior = state.operations?.filter(op => op.kind === "worktree" && op.taskId === taskId).at(-1);
    if (!!branch !== !!directory) throw new Error("Incomplete worktree ownership; inspect persisted evidence.");
    if (!branch) {
      const token = state.runId + "-" + (taskId ?? "integration") + "-" + randomUUID();
      branch = "codex/" + token;
      directory = path.join(common, PATHS.worktreesDir, token);
    }
    const token = branch.slice("codex/".length);
    if (!branch.startsWith("codex/" + state.runId + "-" + (taskId ?? "integration") + "-") ||
        !/^[A-Za-z0-9_-]+$/.test(token) || path.resolve(directory!) !== path.join(common, PATHS.worktreesDir, token)) {
      throw new Error("Worktree path or branch does not match validated run ownership.");
    }
    const owned: OwnedWorktree = { directory: directory!, branch, baseCommit: base };
    if ((taskId ? record?.branch : state.integrationBranch) && (!prior || prior.runId !== state.runId ||
        prior.expectedAfter.branch !== branch || prior.expectedAfter.worktreePath !== directory ||
        prior.expectedAfter.headCommit !== base)) throw new Error("Worktree ownership has no matching persisted operation.");

    const launches = state.processes?.filter(item => path.resolve(item.cwd) === path.resolve(owned.directory)) ?? [];
    if (launches.length) {
      const occupancy = await this.stateRepo.inspectEnvironment(intentName, this.processes, { cwd: owned.directory });
      if (!occupancy.safeToReuse) throw new Error("Worktree occupancy is unresolved: " + occupancy.diagnostics.join(" "));
    }
    const inspect = () => {
      const registered = this.git.listWorktrees(repository).find(item => path.resolve(item.directory) === path.resolve(owned.directory));
      if (!registered) return false;
      const info = this.git.getRepositoryInfo(owned.directory);
      if (registered.locked || registered.prunable || registered.branch !== owned.branch ||
          info.branch !== owned.branch || info.commonDirectory !== common || !info.head ||
          realpathSync(owned.directory) !== path.resolve(owned.directory) ||
          !this.git.isAncestor(repository, base, info.head)) throw new Error("Existing worktree identity changed; preserve it for recovery.");
      return true;
    };
    let exists = inspect();
    if (prior?.status === "succeeded") {
      if (!exists) throw new Error("Prepared worktree is missing; inspect artifacts before recovery.");
      if (taskId && record?.stages?.preparation?.status !== "succeeded") {
        this.stateRepo.updateTask(intentName, taskId, task => {
          (task.stages ??= {}).preparation = { status: "succeeded", completedAt: prior.outcome?.recordedAt, operationId: prior.id };
        });
      }
      return owned;
    }
    const operation: ExecutionOperation = prior?.status === "intended" ? prior : {
      id: randomUUID(), runId: state.runId, taskId, attempt: record?.attempt ?? 0,
      kind: "worktree", status: "intended", intendedAt: new Date().toISOString(),
      before: { repositoryPath: repository, branch, worktreePath: owned.directory,
        headCommit: exists ? this.git.getRepositoryInfo(owned.directory).head : null, exists },
      expectedAfter: { repositoryPath: repository, branch, worktreePath: owned.directory, headCommit: base, exists: true },
    };
    if (operation !== prior) {
      // Reserve the identity and operation together, before creating any Git artifact.
      this.stateRepo.update(intentName, current => {
        const existingBranch = taskId ? current.tasks[taskId].branch : current.integrationBranch;
        if (existingBranch && existingBranch !== branch) throw new Error("Worktree ownership changed concurrently; reload before retrying.");
        (current.operations ??= []).push(operation);
        if (taskId) {
          Object.assign(current.tasks[taskId], { branch, worktreePath: owned.directory, baseCommit: base, stage: "preparation" });
        } else {
          current.integrationBranch = branch;
          current.integrationWorktreePath = owned.directory;
        }
      });
    }
    if (taskId) this.stateRepo.updateTask(intentName, taskId, task => {
      task.stage = "preparation";
      (task.stages ??= {}).preparation = { status: "running", startedAt: new Date().toISOString(), operationId: operation.id };
    });
    const lockPath = path.join(common, token + ".preparation.lock");
    let lock: number;
    try { lock = openSync(lockPath, "wx"); }
    catch (error) { throw new Error("Preparation is already owned or interrupted; inspect lock " + lockPath + " before retrying.", { cause: error }); }
    try {
      if (!exists) {
        if (existsSync(owned.directory)) throw new Error("Unregistered worktree path exists; preserve it and inspect before retrying.");
        const root = path.join(common, PATHS.worktreesDir);
        mkdirSync(root, { recursive: true });
        if (realpathSync(root) !== path.resolve(root)) throw new Error("Owned worktree root is redirected; inspect before retrying.");
        const branchExists = this.command(repository, ["for-each-ref", "--format=%(objectname)", "refs/heads/" + branch]);
        if (branchExists && branchExists !== base) throw new Error("Partially created branch changed; preserve it for recovery.");
        this.command(repository, branchExists
          ? ["worktree", "add", "--", owned.directory, branch]
          : ["worktree", "add", "-b", branch, "--", owned.directory, base]);
        exists = inspect();
        if (!exists) throw new Error("Worktree creation could not be verified.");
      }
      const result = await this.processes.exec("npm ci", {
        cwd: owned.directory, intentName, taskId, kind: "preparation",
        onProcessRecord: this.stateRepo.processReporter(intentName),
      });
      if (result.exitCode !== 0) throw new Error("npm ci failed (exit " + result.exitCode + ").\n" + result.stdout + "\n" + result.stderr);
      if (!inspect()) throw new Error("Worktree disappeared during preparation.");
      this.stateRepo.recordOperationOutcome(intentName, operation.id, "succeeded", {
        recordedAt: new Date().toISOString(), after: { ...operation.expectedAfter, headCommit: this.git.getRepositoryInfo(owned.directory).head },
        diagnostics: [result.stdout, result.stderr].filter(Boolean),
      });
      if (taskId) this.stateRepo.updateTask(intentName, taskId, task => {
        (task.stages ??= {}).preparation = { status: "succeeded", completedAt: new Date().toISOString(), operationId: operation.id };
      });
      return owned;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const recordedAt = new Date().toISOString();
      const current = this.stateRepo.load(intentName)!;
      if (current.operations?.find(item => item.id === operation.id)?.status === "intended") {
        // Inspection failures are diagnostic evidence, never a reason to delete artifacts.
        let head: string | null = null;
        try { if (existsSync(owned.directory)) head = this.git.getRepositoryInfo(owned.directory).head; } catch { /* preserve unknown identity */ }
        this.stateRepo.recordOperationOutcome(intentName, operation.id, "failed", {
          recordedAt, after: { ...operation.expectedAfter, headCommit: head, exists: existsSync(owned.directory) }, diagnostics: [message],
        });
      }
      this.stateRepo.update(intentName, current => {
        const diagnostic = { stage: "preparation" as const, message, recordedAt, operationId: operation.id };
        if (taskId) {
          const task = current.tasks[taskId];
          task.status = "failed";
          (task.errors ??= []).push(message);
          (task.diagnostics ??= []).push(diagnostic);
          (task.stages ??= {}).preparation = { status: "failed", completedAt: recordedAt, operationId: operation.id };
        } else {
          current.status = "paused";
          (current.diagnostics ??= []).push(diagnostic);
        }
      });
      throw error;
    } finally {
      closeSync(lock);
      unlinkSync(lockPath);
    }
  }
}
