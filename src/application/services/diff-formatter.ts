import { DirectoryGitGateway, GitGateway } from "../../infrastructure/git/GitGateway.js";

export interface GitDiffRange {
  directory: string;
  baseCommit: string;
  resultCommit: string;
}

/**
 * Formats git diffs for a list of files (or all changed files) into markdown code blocks.
 */
export function formatGitDiffSummary(git: GitGateway, files?: string[], range?: GitDiffRange): string {
  if (!git.hasRepository(range?.directory)) {
    if (range) throw new Error("Git repository not available for accumulated-result review.");
    return "Git repository not available.";
  }
  let rangeGit: Pick<DirectoryGitGateway, "getCommitChangedFiles" | "getCommitFileDiff"> | undefined;
  if (range) {
    if (!("getCommitChangedFiles" in git) || typeof git.getCommitChangedFiles !== "function" ||
        !("getCommitFileDiff" in git) || typeof git.getCommitFileDiff !== "function") {
      throw new Error("Git gateway does not support accumulated-result review.");
    }
    rangeGit = git as GitGateway & typeof rangeGit;
  }
  const changedFiles = files ?? (range && rangeGit
    ? rangeGit.getCommitChangedFiles(range.directory, range.baseCommit, range.resultCommit)
    : git.getChangedFiles());
  if (changedFiles.length === 0) {
    return "No changed files reported by Git.";
  }
  return changedFiles
    .map((file) => {
      const diff = range && rangeGit
        ? rangeGit.getCommitFileDiff(range.directory, range.baseCommit, range.resultCommit, file)
        : git.getFileDiff(file);
      return diff
        ? `### File: ${file}\n\`\`\`diff\n${diff}\n\`\`\``
        : `### File: ${file}\n(Diff unavailable)`;
    })
    .join("\n\n");
}
