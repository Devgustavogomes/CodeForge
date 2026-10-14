export interface GitGateway {
  hasRepository(directory?: string): boolean;
  getChangedFiles(directory?: string): string[];
  getFileDiff(filePath: string, directory?: string): string | null;
}

export interface RepositoryInfo {
  directory: string;
  gitDirectory: string;
  commonDirectory: string;
  branch: string | null;
  head: string | null;
}

export interface GitStatusEntry {
  path: string;
  originalPath?: string;
  index: string;
  worktree: string;
  kind: "tracked" | "untracked" | "ignored";
}

export interface WorktreeInfo {
  directory: string;
  head: string;
  branch: string | null;
  locked: boolean;
  prunable: boolean;
}

/** Persist this identity for recovery and cleanup; never reconstruct it from user paths. */
export interface OwnedWorktree {
  directory: string;
  branch: string;
  baseCommit: string;
}

export interface IntegrationResult {
  status: "integrated" | "conflicted";
  head: string;
  conflicts: string[];
  diagnostics: string;
}

/** Mutating integration primitives are serialized across gateway instances/processes. */
export interface DirectoryGitGateway extends GitGateway {
  getRepositoryInfo(directory: string): RepositoryInfo;
  getStatus(directory: string): GitStatusEntry[];
  createWorktree(directory: string, executionId: string, taskId: string, base: string): OwnedWorktree;
  listWorktrees(directory: string): WorktreeInfo[];
  getCommitMessage(directory: string, commit: string): string;
  stageAll(directory: string): void;
  commit(directory: string, message: string): string;
  integrate(directory: string, resultCommit: string): IntegrationResult;
  continueIntegration(directory: string, message: string): string;
  getConflicts(directory: string): string[];
  isAncestor(directory: string, ancestor: string, descendant: string): boolean;
  getCommitChangedFiles(directory: string, base: string, result: string): string[];
  getCommitFileDiff(directory: string, base: string, result: string, filePath: string): string | null;
  updateOriginalBranch(directory: string, branch: string, expectedHead: string, result: string): boolean;
  removeWorktree(directory: string, worktree: OwnedWorktree, deliveredCommit: string, processesInactive: boolean): void;
}
