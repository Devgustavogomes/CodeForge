import { GitGateway } from "../../infrastructure/git/GitGateway.js";

/**
 * Formats git diffs for a list of files (or all changed files) into markdown code blocks.
 */
export function formatGitDiffSummary(git: GitGateway, files?: string[]): string {
  if (!git.hasRepository()) {
    return "Git repository not available.";
  }
  const changedFiles = files ?? git.getChangedFiles();
  if (changedFiles.length === 0) {
    return "No changed files reported by Git.";
  }
  return changedFiles
    .map((file) => {
      const diff = git.getFileDiff(file);
      return diff
        ? `### File: ${file}\n\`\`\`diff\n${diff}\n\`\`\``
        : `### File: ${file}\n(Diff unavailable)`;
    })
    .join("\n\n");
}
