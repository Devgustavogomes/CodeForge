import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { GitCommandError, NodeGitGateway } from "../../../src/infrastructure/git/NodeGitGateway.js";

describe("NodeGitGateway temporary repositories", { timeout: 15000 }, () => {
  let temporary: string;
  let repository: string;
  let git: NodeGitGateway;
  let base: string;
  const command = (directory: string, ...args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (directory: string, name: string, content: string) => writeFileSync(path.join(directory, name), content);

  beforeEach(() => {
    temporary = mkdtempSync(path.join(os.tmpdir(), "codeforge git spaces "));
    repository = path.join(temporary, "original repository");
    mkdirSync(repository);
    command(repository, "init", "-b", "main");
    command(repository, "config", "user.name", "Git Gateway Test");
    command(repository, "config", "user.email", "gateway@example.test");
    command(repository, "config", "commit.gpgsign", "false");
    command(repository, "config", "core.autocrlf", "false");
    git = new NodeGitGateway(repository);
    write(repository, ".gitignore", "ignored*\n");
    write(repository, "tracked.txt", "base\n");
    git.stageAll(repository);
    base = git.commit(repository, "Initial commit");
  });

  afterEach(() => {
    // Only delete the exact temporary fixture root allocated by this test.
    if (temporary && path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith("codeforge git spaces ")) rmSync(temporary, { recursive: true, force: true });
  });

  it("inspects explicit directories, .git-file worktrees, unique identities and detached HEAD", () => {
    const first = git.createWorktree(repository, "run-1", "TASK-002", base);
    const second = git.createWorktree(repository, "run-1", "TASK-002", base);
    expect(first.branch).toMatch(/^codex\/run-1-TASK-002-/);
    expect(second.branch).not.toBe(first.branch);
    expect(second.directory).not.toBe(first.directory);
    expect(readFileSync(path.join(first.directory, ".git"), "utf8")).toContain("gitdir:");
    expect(git.hasRepository(first.directory)).toBe(true);
    expect(git.getRepositoryInfo(first.directory)).toMatchObject({ branch: first.branch, head: base, commonDirectory: git.getRepositoryInfo(repository).commonDirectory });
    expect(git.listWorktrees(repository)).toEqual(expect.arrayContaining([expect.objectContaining({ directory: first.directory.replaceAll("\\", "/"), branch: first.branch })]));
    command(first.directory, "checkout", "--detach", base);
    expect(git.getRepositoryInfo(first.directory).branch).toBeNull();
    expect(git.getRepositoryInfo(repository).branch).toBe("main");
    expect(git.hasRepository(temporary)).toBe(false);
  });

  it("reports tracked, staged, nonignored untracked and ignored paths without trimming filenames", () => {
    write(repository, "tracked.txt", "modified\n");
    write(repository, "new file.txt", "new\n");
    write(repository, "ignored-secret", "ignored\n");
    write(repository, " leading space.txt", "space\n");
    expect(git.getStatus(repository)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "tracked.txt", kind: "tracked", worktree: "M" }),
      expect.objectContaining({ path: "new file.txt", kind: "untracked" }),
      expect.objectContaining({ path: "ignored-secret", kind: "ignored" }),
    ]));
    expect(git.getChangedFiles(repository)).toContain(" leading space.txt");
    expect(git.getChangedFiles(repository)).not.toContain("ignored-secret");
    git.stageAll(repository);
    expect(git.getStatus(repository)).toContainEqual(expect.objectContaining({ path: "new file.txt", index: "A" }));
    expect(git.getFileDiff("tracked.txt", repository)).toContain("+modified");
    git.commit(repository, "Status fixture");
    command(repository, "mv", "tracked.txt", "renamed file.txt");
    expect(git.getStatus(repository)).toContainEqual(expect.objectContaining({ path: "renamed file.txt", originalPath: "tracked.txt", index: "R" }));
  });

  it("commits new files locally, integrates serially, delivers and safely removes owned worktrees", () => {
    const task = git.createWorktree(repository, "run", "task", base);
    const integration = git.createWorktree(repository, "run", "integration", base);
    write(task.directory, "added file.txt", "new result\n");
    git.stageAll(task.directory);
    const result = git.commit(task.directory, "Task result");
    expect(git.getChangedFiles(repository)).toEqual([]);
    expect(git.getCommitChangedFiles(task.directory, base, result)).toEqual(["added file.txt"]);
    expect(git.getCommitFileDiff(repository, base, result, "added file.txt")).toContain("+new result");
    expect(git.isAncestor(repository, base, result)).toBe(true);
    expect(git.isAncestor(repository, result, base)).toBe(false);
    expect(() => git.removeWorktree(repository, task, base, true)).toThrow("undelivered");
    const merged = git.integrate(integration.directory, result);
    expect(merged.status).toBe("integrated");
    expect(git.isAncestor(repository, result, merged.head)).toBe(true);
    expect(git.updateOriginalBranch(repository, "main", base, merged.head)).toBe(true);
    expect(readFileSync(path.join(repository, "added file.txt"), "utf8")).toBe("new result\n");
    expect(() => git.removeWorktree(repository, task, merged.head, false)).toThrow("inactive");
    write(task.directory, "pending.txt", "preserve");
    expect(() => git.removeWorktree(repository, task, merged.head, true)).toThrow("pending");
    rmSync(path.join(task.directory, "pending.txt"));
    git.removeWorktree(repository, task, merged.head, true);
    expect(command(repository, "rev-parse", task.branch)).toBe(result);
    expect(git.listWorktrees(repository).some(item => item.branch === task.branch)).toBe(false);
  });

  it("removes clean owned worktrees containing ignored files beyond Windows MAX_PATH", () => {
    command(repository, "config", "core.longpaths", "false");
    const task = git.createWorktree(repository, "run", "long-path-task", base);
    const nested = path.join(task.directory, "ignored-cache", "segment".repeat(12), "segment".repeat(12));
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(nested, "cache.txt"), "ignored installation cache");
    expect(path.join(nested, "cache.txt").length).toBeGreaterThan(260);
    git.removeWorktree(repository, task, base, true);
    expect(git.listWorktrees(repository).some(item => item.branch === task.branch)).toBe(false);
    expect(command(repository, "config", "core.longpaths")).toBe("false");
    expect(command(repository, "rev-parse", task.branch)).toBe(base);
  });

  it("preserves conflicts and supports staged resolution commits", () => {
    const task = git.createWorktree(repository, "run", "task", base);
    const integration = git.createWorktree(repository, "run", "integration", base);
    write(task.directory, "tracked.txt", "task\n");
    git.stageAll(task.directory);
    const result = git.commit(task.directory, "Task");
    write(integration.directory, "tracked.txt", "integration\n");
    git.stageAll(integration.directory);
    const previous = git.commit(integration.directory, "Integration");
    const conflict = git.integrate(integration.directory, result);
    expect(conflict).toMatchObject({ status: "conflicted", head: previous, conflicts: ["tracked.txt"] });
    expect(conflict.diagnostics).toContain("CONFLICT");
    expect(() => git.continueIntegration(integration.directory, "Resolved")).toThrow("Resolve and stage");
    expect(git.getConflicts(integration.directory)).toEqual(["tracked.txt"]);
    write(integration.directory, "tracked.txt", "resolved\n");
    git.stageAll(integration.directory);
    const resolved = git.continueIntegration(integration.directory, "Resolved");
    expect(git.isAncestor(repository, result, resolved)).toBe(true);
    expect(git.isAncestor(repository, previous, resolved)).toBe(true);
    expect(git.getConflicts(integration.directory)).toEqual([]);
  });

  it("guards original branch, HEAD and dirty checkout without overwriting user work", () => {
    const task = git.createWorktree(repository, "run", "task", base);
    write(task.directory, "added.txt", "result");
    git.stageAll(task.directory);
    const result = git.commit(task.directory, "Result");
    write(repository, "user.txt", "user work");
    expect(git.updateOriginalBranch(repository, "main", base, result)).toBe(false);
    expect(readFileSync(path.join(repository, "user.txt"), "utf8")).toBe("user work");
    rmSync(path.join(repository, "user.txt"));
    command(repository, "checkout", "-b", "user-branch");
    expect(git.updateOriginalBranch(repository, "main", base, result)).toBe(false);
    command(repository, "checkout", "main");
    write(repository, "user.txt", "committed user work");
    git.stageAll(repository);
    const userHead = git.commit(repository, "User commit");
    expect(git.updateOriginalBranch(repository, "main", base, result)).toBe(false);
    expect(git.getRepositoryInfo(repository).head).toBe(userHead);
    expect(command(repository, "rev-parse", task.branch)).toBe(result);
  });

  it("rejects invalid identifiers, revisions, identity changes and failed commands with diagnostics", () => {
    for (const id of ["../escape", "-option", "", "with space", "a/b"]) expect(() => git.createWorktree(repository, id, "task", base)).toThrow("Invalid identifier");
    expect(git.listWorktrees(repository)).toHaveLength(1);
    expect(() => git.createWorktree(repository, "run", "task", "--help")).toThrow("Invalid revision");
    expect(() => git.getCommitChangedFiles(repository, base, "missing-ref")).toThrow(GitCommandError);
    expect(() => git.getChangedFiles(temporary)).toThrow(/failed in.*codeforge git spaces/);
    expect(() => git.commit(repository, "Nothing to commit")).toThrow(/nothing to commit/);
    const task = git.createWorktree(repository, "run", "task", base);
    expect(() => git.removeWorktree(repository, { ...task, directory: repository }, base, true)).toThrow("owned identity");
    command(task.directory, "checkout", "--detach", base);
    expect(() => git.removeWorktree(repository, task, base, true)).toThrow("identity changed");
  });

  it("refuses overlapping integration operations and preserves dirty integration work", () => {
    const integration = git.createWorktree(repository, "run", "integration", base);
    const lock = path.join(git.getRepositoryInfo(repository).commonDirectory, "codeforge-integration.lock");
    writeFileSync(lock, "active");
    expect(() => new NodeGitGateway(repository).integrate(integration.directory, base)).toThrow("integration lock");
    expect(readFileSync(lock, "utf8")).toBe("active");
    rmSync(lock);
    write(integration.directory, "pending.txt", "pending");
    expect(() => git.integrate(integration.directory, base)).toThrow("clean worktree");
    expect(readFileSync(path.join(integration.directory, "pending.txt"), "utf8")).toBe("pending");
    expect(() => git.continueIntegration(repository, "No merge")).toThrow(GitCommandError);
  });

  it("inspects unborn repositories without hiding diff failures", () => {
    const empty = path.join(temporary, "empty repository");
    mkdirSync(empty);
    command(empty, "init", "-b", "main");
    expect(git.getRepositoryInfo(empty)).toMatchObject({ branch: "main", head: null });
    write(empty, "new.txt", "new");
    expect(git.getChangedFiles(empty)).toEqual(["new.txt"]);
    expect(() => git.getFileDiff("new.txt", empty)).toThrow(GitCommandError);
  });
});
