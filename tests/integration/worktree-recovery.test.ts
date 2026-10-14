import { spawn } from "node:child_process";
import { once } from "node:events";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskBuilder } from "../helpers/task-builder.js";
import { barrier, WorktreeRepository } from "../helpers/worktree-repository.js";
import { TaskOperationsUseCase } from "../../src/application/use-cases/TaskOperationsUseCase.js";
import { FakeProcessExecutor } from "../helpers/fake-process-executor.js";
import { ExecutionRecoveryCoordinator } from "../../src/scheduler/ExecutionRecoveryCoordinator.js";

let fixture: WorktreeRepository;
afterEach(() => fixture?.dispose());
const task = TaskBuilder.aTask().withId("A").build();

describe("real worktree recovery", { timeout: 60000 }, () => {
  it("retries in the same worktree with edits, agent commits and prior gate diagnostics", async () => {
    fixture = new WorktreeRepository([task]);
    fixture.agent = async context => {
      if (fixture.agents.length === 1) {
        fixture.write(context.cwd, "committed.txt", "agent commit");
        fixture.command(context.cwd, "add", ".");
        fixture.command(context.cwd, "commit", "-m", "agent intermediate work");
        fixture.write(context.cwd, "unfinished.txt", "preserve edits");
      } else {
        expect(fixture.read(context.cwd, "committed.txt")).toBe("agent commit");
        expect(fixture.read(context.cwd, "unfinished.txt")).toBe("preserve edits");
        expect(fixture.read(context.cwd, context.promptFilePath)).toContain("first gate failed");
        fixture.write(context.cwd, "finished.txt", "retry result");
      }
    };
    fixture.gate = async () => [{ name: "check", type: "gate", ok: fixture.agents.length > 1,
      exitCode: fixture.agents.length > 1 ? 0 : 1, output: "first gate failed" }];
    expect((await fixture.scheduler().run(fixture.intent, { skipReview: true })).status).toBe("failed");
    const failed = fixture.state().tasks.A;
    const intermediate = fixture.command(failed.worktreePath!, "rev-parse", "HEAD");
    const operations = new TaskOperationsUseCase(fixture.gw, fixture.repo, new FakeProcessExecutor());
    expect(await operations.retryTask(fixture.intent, "A")).toEqual({ kind: "retried" });
    const resumed = await fixture.scheduler().run(fixture.intent, { skipReview: true });
    expect(resumed.status, JSON.stringify({ resumed, task: fixture.state().tasks.A })).toBe("completed");
    expect(fixture.agents.map(context => context.cwd)).toEqual([failed.worktreePath, failed.worktreePath]);
    expect(fixture.state().tasks.A.attempt).toBe(2);
    expect(fixture.git.isAncestor(fixture.directory, intermediate, "main")).toBe(true);
    expect(fixture.read(fixture.directory, "unfinished.txt")).toBe("preserve edits");
    expect(fixture.verifyCalls()).toHaveLength(2);
  });

  it.each(["commit", "integration"] as const)("recovers the %s Git/state interruption window without rerunning the agent or Git operation", async window => {
    fixture = new WorktreeRepository([task]);
    const reached = barrier();
    if (window === "commit") {
      const commit = fixture.git.commit.bind(fixture.git);
      vi.spyOn(fixture.git, "commit").mockImplementation((cwd, message) => {
        const head = commit(cwd, message);
        reached.release();
        throw new Error("interrupted after commit " + head);
      });
    } else {
      const update = fixture.repo.updateTask.bind(fixture.repo);
      let interrupt = true;
      vi.spyOn(fixture.repo, "updateTask").mockImplementation((intent, id, transition) => update(intent, id, (record, state) => {
        transition(record, state);
        if (interrupt && record.integration?.status === "succeeded") {
          interrupt = false;
          reached.release();
          throw new Error("interrupted integration acceptance save");
        }
      }));
    }
    await fixture.scheduler({ taskResultGit: fixture.git, integrationGit: fixture.git, cleanupCoordinator: fixture.keepWorktrees }).run(fixture.intent, { skipReview: true });
    await reached.reached;
    vi.mocked(fixture.git.commit).mockRestore?.();
    vi.mocked(fixture.repo.updateTask).mockRestore?.();
    const taskHead = fixture.command(fixture.state().tasks.A.worktreePath!, "rev-parse", "HEAD");
    const integrationHead = fixture.command(fixture.state().integrationWorktreePath!, "rev-parse", "HEAD");
    const commit = vi.spyOn(fixture.git, "commit");
    const integrate = vi.spyOn(fixture.git, "integrate");
    const recovery = new ExecutionRecoveryCoordinator(fixture.repo, fixture.git, new FakeProcessExecutor());
    expect(await recovery.reconcile(fixture.intent)).toEqual({ ready: true });
    expect(await recovery.reconcile(fixture.intent)).toEqual({ ready: true });
    expect(fixture.state().tasks.A.resultCommit).toBe(taskHead);
    if (window === "integration") expect(fixture.state().lastAcceptedCommit).toBe(integrationHead);
    expect((await fixture.scheduler({ taskResultGit: fixture.git, integrationGit: fixture.git }).run(fixture.intent, { skipReview: true })).status).toBe("completed");
    expect(fixture.agents).toHaveLength(1);
    expect(fixture.verifyCalls()).toHaveLength(1);
    expect(commit).not.toHaveBeenCalled();
    expect(integrate).toHaveBeenCalledTimes(window === "commit" ? 1 : 0);
    expect(fixture.command(fixture.directory, "rev-list", "--count", "main")).toBe("3");
  });

  it("blocks a fresh scheduler while a surviving process occupies the task worktree", async () => {
    fixture = new WorktreeRepository([task]);
    await fixture.lifecycle.initializeRun(fixture.intent, [task], fixture.directory);
    const owned = await fixture.lifecycle.prepareTask(fixture.intent, "A", fixture.state().originalCommit!);
    fixture.write(owned.directory, "unfinished.txt", "surviving work");
    fixture.repo.updateTask(fixture.intent, "A", record => { record.status = "running"; record.stage = "execution"; });
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: owned.directory, stdio: "ignore" });
    try {
      await once(child, "spawn");
      fixture.repo.recordProcess(fixture.intent, {
        id: "surviving-agent", token: "surviving-agent-token", host: os.hostname(), platform: process.platform,
        command: process.execPath, args: [], cwd: owned.directory, taskId: "A", intentName: fixture.intent,
        startedAt: new Date().toISOString(), status: "running", identities: [], diagnostics: [], pid: child.pid,
      });
      vi.spyOn(fixture.inventory, "inspect").mockImplementation(async record => {
        if (record.id !== "surviving-agent") return { status: "interrupted", safeToReuse: true, processes: [], diagnostics: [] };
        process.kill(child.pid!, 0);
        return { status: "active", safeToReuse: false, processes: [{ pid: child.pid!, birth: "controlled-live-process" }], diagnostics: ["surviving process"] };
      });
      expect((await fixture.scheduler().run(fixture.intent, { skipReview: true })).status).toBe("paused");
      expect(fixture.runner.execute).not.toHaveBeenCalled();
      expect(fixture.read(owned.directory, "unfinished.txt")).toBe("surviving work");
      expect(fixture.state().tasks.A.status).toBe("running");
    } finally {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    vi.mocked(fixture.inventory.inspect).mockResolvedValue({ status: "interrupted", safeToReuse: true, processes: [], diagnostics: [] });
    const resumed = await fixture.scheduler().run(fixture.intent, { skipReview: true });
    expect(resumed.status, JSON.stringify(resumed)).toBe("completed");
    expect(fixture.agents[0].cwd).toBe(owned.directory);
    expect(fixture.read(fixture.directory, "unfinished.txt")).toBe("surviving work");
  });
});
