import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, realpathSync, unlinkSync } from "node:fs";
import path from "node:path";
import { DirectoryGitGateway, GitStatusEntry, IntegrationResult, OwnedWorktree, RepositoryInfo, WorktreeInfo } from "./GitGateway.js";
import { WorkspaceGateway } from "../workspace.js";

export class GitCommandError extends Error {
  constructor(readonly directory: string, readonly args: readonly string[], readonly exitCode: number | null, readonly diagnostics: string) {
    super('Git ' + args.join(' ') + ' failed in ' + directory + ' (exit ' + exitCode + '): ' + diagnostics);
    this.name = "GitCommandError";
  }
}

export class NodeGitGateway implements DirectoryGitGateway {
  private readonly defaultDirectory: string;

  // Legacy workspace callers retain their construction API. New callers supply a directory.
  constructor(directoryOrWorkspace: string | WorkspaceGateway = process.cwd()) {
    this.defaultDirectory = path.resolve(typeof directoryOrWorkspace === "string" ? directoryOrWorkspace : process.cwd());
  }

  private run(directory: string, args: string[]): string {
    const cwd = path.resolve(directory);
    try {
      // Managed worktrees plus npm cache paths can exceed MAX_PATH on Windows.
      return execFileSync("git", ["-c", "core.longpaths=true", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined, GIT_COMMON_DIR: undefined, GIT_OBJECT_DIRECTORY: undefined, GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined } });
    } catch (error) {
      const failure = error as { status?: number; stderr?: string; stdout?: string; message?: string };
      throw new GitCommandError(cwd, args, failure.status ?? null, [failure.stderr, failure.stdout, failure.message].filter(Boolean).join("\n").trim());
    }
  }

  private identifier(value: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) throw new Error('Invalid identifier: ' + value);
  }

  private branch(directory: string, branch: string): void {
    if (!branch || branch.startsWith('-')) throw new Error('Invalid branch: ' + branch);
    this.run(directory, ["check-ref-format", "refs/heads/" + branch]);
  }

  private resolveCommit(directory: string, revision: string): string {
    if (!revision || revision.startsWith('-') || Array.from(revision).some(character => character.charCodeAt(0) <= 32)) throw new Error('Invalid revision: ' + revision);
    return this.run(directory, ["rev-parse", "--verify", "--end-of-options", revision + "^{commit}"]).trim();
  }

  private names(output: string): string[] { return output.split("\0").filter(Boolean); }

  hasRepository(directory = this.defaultDirectory): boolean {
    try { return this.run(directory, ["rev-parse", "--is-inside-work-tree"]).trim() === "true"; }
    catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 128 && /not a git repository/i.test(error.diagnostics)) return false;
      throw error;
    }
  }

  getRepositoryInfo(directory: string): RepositoryInfo {
    const top = this.run(directory, ["rev-parse", "--show-toplevel"]).trim();
    const gitDirectory = this.run(directory, ["rev-parse", "--absolute-git-dir"]).trim();
    const commonDirectory = this.run(directory, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
    const branch = this.run(directory, ["branch", "--show-current"]).trim() || null;
    // An unborn branch is a valid repository; other resolution failures are diagnostic errors.
    let head: string | null;
    try { head = this.run(directory, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]).trim(); }
    catch (error) {
      if (!(error instanceof GitCommandError) || error.exitCode !== 1 || !branch) throw error;
      let unborn = false;
      try { this.run(directory, ["show-ref", "--verify", "--quiet", "refs/heads/" + branch]); }
      catch (refError) {
        if (!(refError instanceof GitCommandError) || refError.exitCode !== 1) throw refError;
        unborn = true;
      }
      if (!unborn) throw error;
      head = null;
    }
    return { directory: path.resolve(top), gitDirectory: path.resolve(gitDirectory), commonDirectory: realpathSync(commonDirectory), branch, head };
  }

  getStatus(directory: string): GitStatusEntry[] {
    const fields = this.names(this.run(directory, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching"]));
    const entries: GitStatusEntry[] = [];
    for (let i = 0; i < fields.length; i++) {
      const item = fields[i];
      const index = item[0], worktree = item[1];
      const entry: GitStatusEntry = { path: item.slice(3), index, worktree, kind: index === "?" ? "untracked" : index === "!" ? "ignored" : "tracked" };
      if (index === "R" || index === "C" || worktree === "R" || worktree === "C") entry.originalPath = fields[++i];
      entries.push(entry);
    }
    return entries;
  }

  getChangedFiles(directory = this.defaultDirectory): string[] {
    return this.getStatus(directory).filter(entry => entry.kind !== "ignored").map(entry => entry.path);
  }

  getFileDiff(filePath: string, directory = this.defaultDirectory): string | null {
    return this.run(directory, ["diff", "--no-ext-diff", "--no-textconv", "HEAD", "--", filePath]).trim() || null;
  }

  createWorktree(directory: string, executionId: string, taskId: string, base: string): OwnedWorktree {
    this.identifier(executionId); this.identifier(taskId);
    const baseCommit = this.resolveCommit(directory, base);
    const common = this.getRepositoryInfo(directory).commonDirectory;
    const token = executionId + "-" + taskId + "-" + randomUUID();
    const branch = "codex/" + token;
    const ownedRoot = path.join(common, "codeforge-worktrees");
    mkdirSync(ownedRoot, { recursive: true });
    const worktreeDirectory = path.join(realpathSync(ownedRoot), token);
    this.run(directory, ["worktree", "add", "-b", branch, "--", worktreeDirectory, baseCommit]);
    return { directory: worktreeDirectory, branch, baseCommit };
  }

  listWorktrees(directory: string): WorktreeInfo[] {
    const result: WorktreeInfo[] = [];
    for (const field of this.run(directory, ["worktree", "list", "--porcelain", "-z"]).split("\0")) {
      if (field.startsWith("worktree ")) result.push({ directory: field.slice(9), head: "", branch: null, locked: false, prunable: false });
      const current = result.at(-1);
      if (!current) continue;
      if (field.startsWith("HEAD ")) current.head = field.slice(5);
      if (field.startsWith("branch refs/heads/")) current.branch = field.slice(18);
      if (/^locked(?: |$)/.test(field)) current.locked = true;
      if (/^prunable(?: |$)/.test(field)) current.prunable = true;
    }
    return result;
  }

  getCommitMessage(directory: string, commit: string): string {
    return this.run(directory, ["show", "-s", "--format=%B", this.resolveCommit(directory, commit)]).trim();
  }

  stageAll(directory: string): void { this.run(directory, ["add", "--all"]); }

  commit(directory: string, message: string): string {
    if (!message.trim() || message.includes("\0")) throw new Error("A nonempty commit message is required.");
    this.run(directory, ["commit", "-m", message]);
    return this.resolveCommit(directory, "HEAD");
  }

  private clean(directory: string): boolean {
    const gitDirectory = this.run(directory, ["rev-parse", "--absolute-git-dir"]).trim();
    return !["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"].some(name => existsSync(path.join(gitDirectory, name)))
      && this.getStatus(directory).every(entry => entry.kind === "ignored");
  }

  private serialized<T>(directory: string, operation: () => T): T {
    const lock = path.join(this.getRepositoryInfo(directory).commonDirectory, "codeforge-integration.lock");
    let descriptor: number;
    try { descriptor = openSync(lock, "wx"); }
    catch (error) { throw new Error('Cannot acquire integration lock ' + lock + '. Check for an active operation; reconcile a stale lock before retrying.', { cause: error }); }
    try { return operation(); }
    finally { closeSync(descriptor); unlinkSync(lock); }
  }

  getConflicts(directory: string): string[] {
    return this.names(this.run(directory, ["diff", "--name-only", "--diff-filter=U", "-z"]));
  }

  integrate(directory: string, resultCommit: string): IntegrationResult {
    const commit = this.resolveCommit(directory, resultCommit);
    return this.serialized(directory, () => {
      if (!this.clean(directory)) throw new Error("Integration requires a clean worktree. Preserve local changes before retrying.");
      let diagnostics: string;
      try { diagnostics = this.run(directory, ["merge", "--no-ff", "--no-edit", commit]); }
      catch (error) {
        const conflicts = this.getConflicts(directory);
        if (!(error instanceof GitCommandError) || !conflicts.length) throw error;
        return { status: "conflicted", head: this.resolveCommit(directory, "HEAD"), conflicts, diagnostics: error.diagnostics };
      }
      return { status: "integrated", head: this.resolveCommit(directory, "HEAD"), conflicts: [], diagnostics };
    });
  }

  continueIntegration(directory: string, message: string): string {
    return this.serialized(directory, () => {
      this.resolveCommit(directory, "MERGE_HEAD");
      if (this.getConflicts(directory).length) throw new Error("Resolve and stage all conflicts before continuing integration.");
      return this.commit(directory, message);
    });
  }

  isAncestor(directory: string, ancestor: string, descendant: string): boolean {
    const base = this.resolveCommit(directory, ancestor), result = this.resolveCommit(directory, descendant);
    try { this.run(directory, ["merge-base", "--is-ancestor", base, result]); return true; }
    catch (error) { if (error instanceof GitCommandError && error.exitCode === 1) return false; throw error; }
  }

  getCommitChangedFiles(directory: string, base: string, result: string): string[] {
    return this.names(this.run(directory, ["diff", "--name-only", "-z", this.resolveCommit(directory, base), this.resolveCommit(directory, result), "--"]));
  }

  getCommitFileDiff(directory: string, base: string, result: string, filePath: string): string | null {
    return this.run(directory, ["diff", "--no-ext-diff", "--no-textconv", this.resolveCommit(directory, base), this.resolveCommit(directory, result), "--", filePath]).trim() || null;
  }

  updateOriginalBranch(directory: string, branch: string, expectedHead: string, result: string): boolean {
    this.branch(directory, branch);
    const expected = this.resolveCommit(directory, expectedHead), target = this.resolveCommit(directory, result);
    return this.serialized(directory, () => {
      const info = this.getRepositoryInfo(directory);
      if (info.branch !== branch || info.head !== expected || this.resolveCommit(directory, "refs/heads/" + branch) !== expected || !this.clean(directory) || !this.isAncestor(directory, expected, target)) return false;
      this.run(directory, ["-c", "core.hooksPath=", "-c", "merge.autostash=false", "merge", "--ff-only", "--no-overwrite-ignore", "--no-edit", target]);
      const after = this.getRepositoryInfo(directory);
      return after.branch === branch && after.head === target &&
        this.resolveCommit(directory, "refs/heads/" + branch) === target && this.clean(directory);
    });
  }

  removeWorktree(directory: string, worktree: OwnedWorktree, deliveredCommit: string, processesInactive: boolean): void {
    if (!processesInactive) throw new Error("Confirm that worktree processes are inactive before cleanup.");
    const common = this.getRepositoryInfo(directory).commonDirectory;
    const token = worktree.branch.slice("codex/".length);
    if (!worktree.branch.startsWith("codex/") || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error("Invalid owned worktree identity.");
    const expected = path.join(common, "codeforge-worktrees", token);
    if (!existsSync(expected) || realpathSync(expected) !== path.resolve(expected) || path.resolve(worktree.directory) !== path.resolve(expected)) throw new Error("Worktree path does not match its owned identity.");
    this.serialized(directory, () => {
      const registered = this.listWorktrees(directory).find(item => path.resolve(item.directory) === path.resolve(expected));
      const info = this.getRepositoryInfo(expected);
      if (!registered || registered.locked || registered.prunable || info.commonDirectory !== common || info.branch !== worktree.branch) throw new Error("Worktree repository or branch identity changed; preserve it for recovery.");
      if (!info.head || !this.clean(expected) || this.getConflicts(expected).length || !this.isAncestor(directory, worktree.baseCommit, info.head) || !this.isAncestor(directory, info.head, deliveredCommit)) throw new Error("Worktree has pending or undelivered work; cleanup refused.");
      this.run(directory, ["worktree", "remove", "--", expected]);
    });
  }
}
