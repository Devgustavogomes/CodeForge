import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DeliveryCoordinator } from "../../src/scheduler/DeliveryCoordinator.js";
import { NodeGitGateway } from "../../src/infrastructure/git/NodeGitGateway.js";
import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { TaskBuilder } from "../helpers/task-builder.js";

describe("DeliveryCoordinator with Git", { timeout: 20000 }, () => {
  let directory: string;
  let integration: string;
  let base: string;
  let result: string;
  let repo: ExecutionStateRepository;
  let git: NodeGitGateway;
  let coordinator: DeliveryCoordinator;
  const command = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), "codeforge-delivery-"));
    command(directory, "init", "-b", "main");
    command(directory, "config", "core.autocrlf", "false");
    command(directory, "config", "user.name", "Test");
    command(directory, "config", "user.email", "test@example.com");
    writeFileSync(path.join(directory, ".gitignore"), ".codeforge/\nignored.txt\n");
    writeFileSync(path.join(directory, "existing.txt"), "base\n");
    command(directory, "add", ".");
    command(directory, "commit", "-m", "base");
    base = command(directory, "rev-parse", "HEAD");
    integration = path.join(directory, ".git", "integration");
    command(directory, "worktree", "add", "-b", "codex/integration", integration, base);
    writeFileSync(path.join(integration, "existing.txt"), "updated\n");
    writeFileSync(path.join(integration, "new.txt"), "new\n");
    command(integration, "add", ".");
    command(integration, "commit", "-m", "accumulated result");
    result = command(integration, "rev-parse", "HEAD");
    repo = new ExecutionStateRepository(new NodeWorkspaceGateway(directory));
    const state = repo.init("run", [TaskBuilder.aTask().withId("A").build()]);
    Object.assign(state, { repositoryPath: directory, originalWorktreePath: directory,
      originalBranch: "main", originalCommit: base, integrationBranch: "codex/integration",
      integrationWorktreePath: integration, lastAcceptedCommit: result });
    Object.assign(state.tasks.A, { status: "completed", branch: "codex/A", worktreePath: integration,
      baseCommit: base, resultCommit: result, integration: { status: "succeeded", resultCommit: result, acceptedCommit: result } });
    repo.save(state);
    git = new NodeGitGateway(directory);
    coordinator = new DeliveryCoordinator(repo, git);
  });

  afterEach(() => {
    // Exact test-owned mkdtemp directory, containing all test worktrees.
    rmSync(directory, { recursive: true, force: true });
  });

  it("delivers the complete result and persists verified success after the branch update", () => {
    writeFileSync(path.join(directory, "ignored.txt"), "ignored user work");
    const hookMarker = path.join(directory, "hook-ran.txt");
    writeFileSync(path.join(directory, ".git", "hooks", "post-merge"), "#!/bin/sh\necho hook > hook-ran.txt\n", { mode: 0o755 });
    const update = git.updateOriginalBranch.bind(git);
    vi.spyOn(git, "updateOriginalBranch").mockImplementation((...args) => {
      expect(repo.load("run")?.delivery?.status).toBe("running");
      expect(repo.load("run")?.operations?.at(-1)?.status).toBe("intended");
      expect(repo.load("run")?.delivery?.deliveredCommit).toBeUndefined();
      return update(...args);
    });
    expect(coordinator.deliver("run", true)).toEqual({ delivered: true });
    expect(() => readFileSync(hookMarker)).toThrow();
    expect(command(directory, "rev-parse", "main")).toBe(result);
    expect(command(directory, "rev-parse", "HEAD")).toBe(result);
    expect(readFileSync(path.join(directory, "existing.txt"), "utf8")).toBe("updated\n");
    expect(readFileSync(path.join(directory, "new.txt"), "utf8")).toBe("new\n");
    expect(readFileSync(path.join(directory, "ignored.txt"), "utf8")).toBe("ignored user work");
    expect(repo.load("run")?.delivery?.deliveredCommit).toBe(result);
    expect(repo.load("run")?.operations?.at(-1)?.status).toBe("succeeded");
  });

  it.each(["edit", "staged", "untracked", "branch", "detached", "tip"])("preserves user work when original %s changes", change => {
    if (change === "edit" || change === "staged") writeFileSync(path.join(directory, "existing.txt"), "user work\n");
    if (change === "staged") command(directory, "add", "existing.txt");
    if (change === "untracked") writeFileSync(path.join(directory, "new.txt"), "user work\n");
    if (change === "branch") command(directory, "switch", "-c", "user-branch");
    if (change === "detached") command(directory, "switch", "--detach", base);
    if (change === "tip") command(directory, "commit", "--allow-empty", "-m", "user commit");
    const head = command(directory, "rev-parse", "HEAD");
    const status = command(directory, "status", "--porcelain");
    const index = command(directory, "write-tree");
    expect(coordinator.deliver("run", true).delivered).toBe(false);
    expect(command(directory, "rev-parse", "HEAD")).toBe(head);
    expect(command(directory, "status", "--porcelain")).toBe(status);
    expect(command(directory, "write-tree")).toBe(index);
    expect(command(integration, "rev-parse", "HEAD")).toBe(result);
    expect(repo.load("run")?.delivery?.status).toBe("pending");
    expect(repo.load("run")?.diagnostics?.at(-1)?.message).toContain("retry delivery");
  });

  it.each(["failed task", "pending integration", "blocked integration", "review", "review error"])("does not update Git with %s", condition => {
    repo.update("run", state => {
      if (condition === "failed task") state.tasks.A.status = "failed";
      if (condition === "pending integration") state.tasks.A.integration!.status = "pending";
      if (condition === "blocked integration") state.tasks.A.integration!.status = "blocked";
      if (condition === "review error") state.reviewError = "follow-up required";
    });
    const spy = vi.spyOn(git, "updateOriginalBranch");
    expect(coordinator.deliver("run", condition !== "review").delivered).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(command(directory, "rev-parse", "main")).toBe(base);
  });

  it.each(["repository", "integration HEAD", "integration worktree"])("preserves the result when %s identity changes", change => {
    if (change === "repository") {
      const inspect = git.getRepositoryInfo.bind(git);
      vi.spyOn(git, "getRepositoryInfo").mockImplementation(cwd => ({ ...inspect(cwd),
        ...(cwd === directory ? { commonDirectory: "different repository" } : {}) }));
    }
    if (change === "integration HEAD") command(integration, "commit", "--allow-empty", "-m", "unexpected commit");
    if (change === "integration worktree") writeFileSync(path.join(integration, "new.txt"), "pending work");
    const update = vi.spyOn(git, "updateOriginalBranch");
    expect(coordinator.deliver("run", true).delivered).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(command(directory, "rev-parse", "main")).toBe(base);
    expect(command(integration, "show", result + ":new.txt")).toBe("new");
  });

  it("preserves ignored user files that collide with delivery", () => {
    writeFileSync(path.join(directory, "ignored.txt"), "user data");
    writeFileSync(path.join(integration, "ignored.txt"), "integration data");
    command(integration, "add", "-f", "ignored.txt");
    command(integration, "commit", "-m", "track previously ignored file");
    const target = command(integration, "rev-parse", "HEAD");
    repo.update("run", state => { state.lastAcceptedCommit = target; });
    expect(coordinator.deliver("run", true).delivered).toBe(false);
    expect(readFileSync(path.join(directory, "ignored.txt"), "utf8")).toBe("user data");
    expect(command(directory, "rev-parse", "main")).toBe(base);
    expect(command(integration, "rev-parse", "HEAD")).toBe(target);
  });

  it("rechecks after intent persistence and detects changes at the guarded update", () => {
    const update = git.updateOriginalBranch.bind(git);
    vi.spyOn(git, "updateOriginalBranch").mockImplementation((...args) => {
      writeFileSync(path.join(directory, "existing.txt"), "intervening edit");
      return update(...args);
    });
    expect(coordinator.deliver("run", true).delivered).toBe(false);
    expect(readFileSync(path.join(directory, "existing.txt"), "utf8")).toBe("intervening edit");
    expect(command(directory, "rev-parse", "main")).toBe(base);
  });

  it("does not trust an unverified success response", () => {
    vi.spyOn(git, "updateOriginalBranch").mockReturnValue(true);
    expect(coordinator.deliver("run", true).delivered).toBe(false);
    expect(repo.load("run")?.delivery?.deliveredCommit).toBeUndefined();
  });

  it("retains evidence after failure and reconciles a successful update before retrying", () => {
    const update = git.updateOriginalBranch.bind(git);
    const spy = vi.spyOn(git, "updateOriginalBranch").mockImplementation((...args) => {
      update(...args);
      throw new Error("interrupted after Git update");
    });
    expect(coordinator.deliver("run", true).delivered).toBe(false);
    expect(repo.load("run")?.diagnostics?.at(-1)?.message).toContain("interrupted after Git update");
    expect(repo.load("run")?.operations?.at(-1)?.status).toBe("intended");
    spy.mockClear();
    expect(coordinator.deliver("run", true)).toEqual({ delivered: true });
    expect(spy).not.toHaveBeenCalled();
    expect(repo.load("run")?.operations).toHaveLength(1);
  });

  it("retries a Git failure without losing integration commits", () => {
    const spy = vi.spyOn(git, "updateOriginalBranch").mockImplementationOnce(() => { throw new Error("branch lock unavailable"); });
    expect(coordinator.deliver("run", true).delivered).toBe(false);
    expect(command(integration, "rev-parse", "HEAD")).toBe(result);
    expect(repo.load("run")?.diagnostics?.at(-1)?.message).toContain("branch lock unavailable");
    spy.mockRestore();
    expect(coordinator.deliver("run", true).delivered).toBe(true);
  });
});
