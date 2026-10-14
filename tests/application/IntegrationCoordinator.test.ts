import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import ts from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { IntegrationCoordinator } from "../../src/scheduler/IntegrationCoordinator.js";
import { NodeGitGateway } from "../../src/infrastructure/git/NodeGitGateway.js";
import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { TaskBuilder } from "../helpers/task-builder.js";

describe("IntegrationCoordinator with Git", { timeout: 30000 }, () => {
  let directory: string;
  let integration: string;
  let base: string;
  let repo: ExecutionStateRepository;
  let git: NodeGitGateway;
  let coordinator: IntegrationCoordinator;
  const command = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), "codeforge-integration-"));
    command(directory, "init", "-b", "main");
    command(directory, "config", "user.name", "Test");
    command(directory, "config", "user.email", "test@example.com");
    writeFileSync(path.join(directory, ".gitignore"), ".codeforge/\n");
    writeFileSync(path.join(directory, "shared.txt"), "base\n");
    command(directory, "add", ".");
    command(directory, "commit", "-m", "base");
    base = command(directory, "rev-parse", "HEAD");
    integration = path.join(directory, "integration");
    command(directory, "worktree", "add", "-b", "codex/integration", integration, base);
    repo = new ExecutionStateRepository(new NodeWorkspaceGateway(directory));
    const state = repo.init("run", ["A", "B"].map(id => TaskBuilder.aTask().withId(id).build()));
    Object.assign(state, { repositoryPath: directory, integrationBranch: "codex/integration",
      integrationWorktreePath: integration, lastAcceptedCommit: base });
    repo.save(state);
    git = new NodeGitGateway(directory);
    coordinator = new IntegrationCoordinator(repo, git);
    coordinator.acquire("run");
  });

  afterEach(() => {
    coordinator.release("run");
    // This path is the exact directory created by mkdtemp for this test.
    rmSync(directory, { recursive: true, force: true });
  });

  function approve(id: string, file = id + ".txt", content = id, fixedBase = base): string {
    const worktree = path.join(directory, id);
    command(directory, "worktree", "add", "-b", "codex/" + id, worktree, fixedBase);
    writeFileSync(path.join(worktree, file), content);
    command(worktree, "add", ".");
    command(worktree, "commit", "-m", id);
    const result = command(worktree, "rev-parse", "HEAD");
    repo.updateTask("run", id, task => Object.assign(task, { status: "completed", branch: "codex/" + id,
      worktreePath: worktree, baseCommit: fixedBase, resultCommit: result, integration: { status: "pending", resultCommit: result } }));
    return result;
  }

  it("persists FIFO results and integrates against the preceding accepted commit", async () => {
    const a = approve("A");
    const b = approve("B");
    coordinator.enqueueApproved("run");
    expect(repo.load("run")?.integrationQueue).toEqual(["A", "B"]);
    const original = git.integrate.bind(git);
    const snapshots: string[] = [];
    vi.spyOn(git, "integrate").mockImplementation((cwd, result) => {
      const state = repo.load("run")!;
      const operation = state.operations!.at(-1)!;
      expect(operation.status).toBe("intended");
      expect(operation.before.headCommit).toBe(state.lastAcceptedCommit);
      expect(state.tasks[operation.taskId!].integration?.status).toBe("running");
      snapshots.push(state.lastAcceptedCommit!);
      return original(cwd, result);
    });
    await coordinator.drain("run");
    const state = repo.load("run")!;
    expect(snapshots).toEqual([base, state.tasks.A.integration!.acceptedCommit]);
    expect(state.integrationQueue).toEqual([]);
    expect(state.operations?.every(op => op.status === "succeeded" && op.outcome?.after.headCommit)).toBe(true);
    expect(git.isAncestor(integration, a, state.lastAcceptedCommit!)).toBe(true);
    expect(git.isAncestor(integration, b, state.lastAcceptedCommit!)).toBe(true);
  });

  it("rechecks dependency readiness when the persisted queue is out of DAG order", async () => {
    const a = approve("A");
    approve("B", "B.txt", "B", a);
    repo.update("run", state => {
      state.tasks.B.dependencies = ["A"];
      state.integrationQueue = ["B", "A"];
    });
    await coordinator.drain("run");
    expect(repo.load("run")?.operations?.map(op => op.taskId)).toEqual(["A", "B"]);
    expect(repo.load("run")?.integrationQueue).toEqual([]);
  });

  it("retains exclusive ownership across processes and separate repositories", () => {
    const second = new IntegrationCoordinator(new ExecutionStateRepository(new NodeWorkspaceGateway(directory)), git);
    expect(() => second.acquire("run")).toThrow("occupied");
    for (const file of ["scheduler/IntegrationCoordinator", "infrastructure/repositories/ExecutionStateRepository",
      "infrastructure/workspace", "infrastructure/paths", "domain/execution"]) {
      const source = readFileSync(new URL("../../src/" + file + ".ts", import.meta.url), "utf8");
      const output = path.join(directory, file + ".mjs");
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      } }).outputText.replaceAll('.js"', '.mjs"'));
    }
    const url = (file: string) => JSON.stringify(pathToFileURL(path.join(directory, file + ".mjs")).href);
    const script =
      'import { ExecutionStateRepository } from ' + url('infrastructure/repositories/ExecutionStateRepository') + ';' +
      'import { NodeWorkspaceGateway } from ' + url('infrastructure/workspace') + ';' +
      'import { IntegrationCoordinator } from ' + url('scheduler/IntegrationCoordinator') + ';' +
      'const repo = new ExecutionStateRepository(new NodeWorkspaceGateway(process.argv[1]));' +
      'try { new IntegrationCoordinator(repo, {}).acquire("run"); process.exitCode = 1; } catch (error) { console.log(error.message); }';
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, directory], { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("occupied");
    expect(repo.load("run")?.integrationOwner).toBeDefined();
  });

  it("does not promote evidence after a Git exception and still integrates another result", async () => {
    approve("A");
    approve("B");
    const original = git.integrate.bind(git);
    vi.spyOn(git, "integrate").mockImplementationOnce(() => { throw new Error("Git failed"); }).mockImplementation(original);
    await coordinator.drain("run");
    const state = repo.load("run")!;
    expect(state.tasks.A.integration?.status).toBe("blocked");
    expect(state.tasks.A.integration?.acceptedCommit).toBeUndefined();
    expect(state.operations![0].outcome?.after.headCommit).toBe(base);
    expect(state.operations![1].before.headCommit).toBe(base);
    expect(state.tasks.B.integration?.status).toBe("succeeded");
  });

  it("preserves conflicted Git work and the last accepted reference", async () => {
    approve("A", "shared.txt", "A\n");
    approve("B", "shared.txt", "B\n");
    await coordinator.drain("run");
    const state = repo.load("run")!;
    expect(state.tasks.B.integration?.status).toBe("blocked");
    expect(state.lastAcceptedCommit).toBe(state.tasks.A.integration?.acceptedCommit);
    expect(git.getConflicts(integration)).toEqual(["shared.txt"]);
    expect(state.operations?.at(-1)?.status).toBe("failed");
  });

  it("refuses a dependent result whose fixed base excludes its dependency", async () => {
    approve("A");
    approve("B");
    repo.updateTask("run", "B", task => { task.dependencies = ["A"]; });
    await coordinator.drain("run");
    expect(repo.load("run")?.tasks.B.integration?.status).toBe("blocked");
    expect(repo.load("run")?.operations).toHaveLength(1);
  });

  it("leaves active worktree files and fixed base metadata unchanged", async () => {
    approve("A");
    const worktree = path.join(directory, "B");
    command(directory, "worktree", "add", "-b", "codex/B", worktree, base);
    writeFileSync(path.join(worktree, "active.txt"), "in progress");
    repo.updateTask("run", "B", task => Object.assign(task, { status: "running", branch: "codex/B", worktreePath: worktree, baseCommit: base }));
    const before = repo.load("run")!.tasks.B;
    await coordinator.drain("run");
    expect(repo.load("run")!.tasks.B).toEqual(before);
    expect(command(worktree, "rev-parse", "HEAD")).toBe(base);
    expect(readFileSync(path.join(worktree, "active.txt"), "utf8")).toBe("in progress");
    expect(() => readFileSync(path.join(worktree, "A.txt"))).toThrow();
  });
});
