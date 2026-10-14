import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskBuilder } from "../helpers/task-builder.js";
import { barrier, WorktreeRepository } from "../helpers/worktree-repository.js";

let fixture: WorktreeRepository;
afterEach(() => fixture?.dispose());
const task = (id: string, dependencies: string[] = []) => TaskBuilder.aTask().withId(id).withDependencies(dependencies).build();

describe("real worktree execution", { timeout: 60000 }, () => {
  it("keeps parallel ESLint failure local while accepting the independent older-base result", async () => {
    fixture = new WorktreeRepository([task("A"), task("B")]);
    fixture.useESLint();
    const both = barrier();
    fixture.agent = async context => {
      fixture.write(context.cwd, context.taskId + ".js", context.taskId === "A" ? "missingGlobal();\n" : "export const valid = 1;\n");
      fixture.write(context.cwd, "node_modules/owner", context.taskId!);
      if (fixture.agents.length === 2) both.release();
      await both.reached;
      expect(fixture.read(context.cwd, "node_modules/owner")).toBe(context.taskId);
    };
    const original = fixture.command(fixture.directory, "rev-parse", "HEAD");
    const result = await fixture.scheduler().run(fixture.intent, { skipReview: true });
    expect(result.status).toBe("failed");
    const state = fixture.state();
    expect(state.tasks.A.status).toBe("failed");
    expect(state.tasks.A.errors!.join("\n")).toContain("no-undef");
    expect(state.tasks.B.integration!.status).toBe("succeeded");
    expect(state.tasks.A.baseCommit).toBe(state.tasks.B.baseCommit);
    expect(new Set(fixture.agents.map(context => context.cwd)).size).toBe(2);
    expect(fixture.verifyCalls().map(context => context.cwd).sort()).toEqual(fixture.agents.map(context => context.cwd).sort());
    expect(fixture.command(fixture.directory, "rev-parse", "HEAD")).toBe(original);
    expect(existsSync(path.join(fixture.directory, "A.js"))).toBe(false);
    expect(fixture.git.isAncestor(fixture.directory, state.tasks.B.resultCommit!, state.lastAcceptedCommit!)).toBe(true);
    expect(state.processes!.filter(record => record.kind === "preparation" && record.exitCode === 0)).toHaveLength(3);
  });

  it("isolates sequential dependent tasks and starts each from the accepted dependency commit", async () => {
    fixture = new WorktreeRepository([task("A"), task("B", ["A"]), task("C", ["B"])]);
    fixture.agent = async context => {
      const state = fixture.state();
      if (context.taskId !== "A") {
        const dependency = context.taskId === "B" ? "A" : "B";
        expect(state.tasks[dependency].integration!.status).toBe("succeeded");
        expect(fixture.read(context.cwd, dependency + ".txt")).toBe("accepted\n");
        expect(fixture.git.isAncestor(context.cwd, state.tasks[dependency].resultCommit!, state.tasks[context.taskId!].baseCommit!)).toBe(true);
      }
      expect(existsSync(path.join(context.cwd, "node_modules/local/package.json"))).toBe(true);
      fixture.write(context.cwd, context.taskId + ".txt", "accepted\n");
    };
    expect((await fixture.scheduler().run(fixture.intent, { skipReview: true })).status).toBe("completed");
    expect(fixture.agents.map(context => context.taskId)).toEqual(["A", "B", "C"]);
    expect(new Set(fixture.agents.map(context => context.cwd)).size).toBe(3);
    expect(fixture.verifyCalls()).toHaveLength(3);
    expect(fixture.verifyCalls().every(context => context.cwd !== fixture.directory && context.cwd !== fixture.state().integrationWorktreePath)).toBe(true);
    expect(fixture.git.listWorktrees(fixture.directory)).toHaveLength(1);
    for (const record of Object.values(fixture.state().tasks)) {
      expect(fixture.command(fixture.directory, "rev-parse", record.branch!)).toBe(record.resultCommit);
      expect(fixture.git.isAncestor(fixture.directory, record.resultCommit!, "main")).toBe(true);
    }
  });

  it("serially accepts independent results from the same older base without common gates", async () => {
    fixture = new WorktreeRepository([task("A"), task("B")]);
    const both = barrier();
    const integratedA = barrier();
    const integrate = fixture.git.integrate.bind(fixture.git);
    const heads: string[] = [];
    vi.spyOn(fixture.git, "integrate").mockImplementation((cwd, commit) => {
      heads.push(fixture.command(cwd, "rev-parse", "HEAD"));
      const result = integrate(cwd, commit);
      integratedA.release();
      return result;
    });
    const parentCwd = process.cwd();
    fixture.agent = async context => {
      fixture.write(context.cwd, context.taskId + ".txt", "independent result");
      if (fixture.agents.length === 2) both.release();
      await both.reached;
      if (context.taskId === "B") await integratedA.reached;
    };
    expect((await fixture.scheduler({ integrationGit: fixture.git }).run(fixture.intent, { skipReview: true })).status).toBe("completed");
    const state = fixture.state();
    expect(state.tasks.A.baseCommit).toBe(state.originalCommit);
    expect(state.tasks.B.baseCommit).toBe(state.originalCommit);
    expect(heads).toEqual([state.originalCommit, state.tasks.A.integration!.acceptedCommit]);
    expect(fixture.verifyCalls()).toHaveLength(2);
    expect(fixture.verifyCalls().every(context => fixture.agents.some(agent => agent.cwd === context.cwd))).toBe(true);
    expect(process.cwd()).toBe(parentCwd);
    for (const id of ["A", "B"]) {
      expect(fixture.read(fixture.directory, id + ".txt")).toBe("independent result");
      expect(fixture.git.isAncestor(fixture.directory, state.tasks[id].resultCommit!, "main")).toBe(true);
      expect(state.tasks[id].cleanup!.status).toBe("succeeded");
      expect(existsSync(state.tasks[id].worktreePath!)).toBe(false);
    }
    // Gate counts establish isolation and scheduling, not semantic correctness of combined code.
  });

  it("preserves real npm ci failure diagnostics before launching any agent or task gate", async () => {
    fixture = new WorktreeRepository([task("A")]);
    const execute = fixture.processes.exec.bind(fixture.processes);
    vi.spyOn(fixture.processes, "exec").mockImplementation((command, options) => {
      if (options?.taskId === "A") fixture.write(options.cwd!, "package-lock.json", "invalid JSON");
      return execute(command, options);
    });
    expect((await fixture.scheduler().run(fixture.intent, { skipReview: true })).status).toBe("failed");
    expect(fixture.agents).toHaveLength(0);
    expect(fixture.events.some(context => context.event.startsWith("task."))).toBe(false);
    const failed = fixture.state().tasks.A;
    expect(failed.diagnostics!.map(entry => entry.message).join("\n")).toContain("npm ci failed");
    expect(existsSync(failed.worktreePath!)).toBe(true);
    expect(fixture.command(fixture.directory, "rev-parse", failed.branch!)).toBe(failed.baseCommit);
  });

  it.each([false, true])("serializes real conflicts and preserves resolution work when gates fail twice: %s", async fail => {
    fixture = new WorktreeRepository([task("A"), task("B"), task("C", ["B"])]);
    const both = barrier();
    const aCompleted = barrier();
    const integration = vi.spyOn(fixture.git, "integrate");
    fixture.agent = async context => {
      if (context.cwd === fixture.state().integrationWorktreePath) {
        expect(fixture.git.getConflicts(context.cwd)).toEqual(fail && fixture.state().tasks.B.integration!.resolution!.attempts === 2 ? [] : ["shared.txt"]);
        fixture.write(context.cwd, "shared.txt", "resolved\n");
        fixture.command(context.cwd, "add", "shared.txt");
        return;
      }
      if (context.taskId === "C") { fixture.write(context.cwd, "C.txt", "dependent"); return; }
      fixture.write(context.cwd, "shared.txt", context.taskId + "\n");
      if (fixture.agents.length === 2) both.release();
      await both.reached;
      if (context.taskId === "B") await aCompleted.reached;
    };
    fixture.hooks.dispatch.mockImplementation(async context => {
      fixture.events.push(context);
      if (context.event === "task.completed" && context.taskId === "A") aCompleted.release();
      if (context.event === "task.verify" && context.cwd === fixture.state().integrationWorktreePath) {
        return [{ name: "resolution", type: "gate", ok: !fail, exitCode: fail ? 1 : 0, output: "resolution gate diagnostic" }];
      }
      return [];
    });
    const result = await fixture.scheduler({ integrationGit: fixture.git, cleanupCoordinator: fixture.keepWorktrees }).run(fixture.intent, { skipReview: true });
    const state = fixture.state();
    const resolution = state.tasks.B.integration!.resolution!;
    expect(resolution.status).toBe(fail ? "exhausted" : "succeeded");
    expect(resolution.attempts).toBe(fail ? 2 : 1);
    expect(fixture.verifyCalls().filter(context => context.cwd === state.integrationWorktreePath)).toHaveLength(fail ? 2 : 1);
    expect(fixture.verifyCalls()).toHaveLength(4);
    expect(integration).toHaveBeenCalledTimes(fail ? 2 : 3);
    expect(fixture.read(state.integrationWorktreePath!, "shared.txt")).toBe("resolved\n");
    expect(fixture.command(fixture.directory, "rev-parse", state.tasks.B.branch!)).toBe(state.tasks.B.resultCommit);
    if (fail) {
      expect(result.status).toBe("failed");
      expect(state.tasks.B.integration!.status).toBe("blocked");
      expect(state.tasks.C.status).toBe("pending");
      expect(state.lastAcceptedCommit).toBe(state.tasks.A.integration!.acceptedCommit);
      expect(resolution.diagnostics.join("\n")).toContain("resolution gate diagnostic");
      expect(fixture.agents.some(context => context.taskId === "C")).toBe(false);
      expect(fixture.git.listWorktrees(fixture.directory)).toHaveLength(4);
    } else {
      expect(result.status).toBe("completed");
      expect(fixture.read(fixture.directory, "shared.txt")).toBe("resolved\n");
      expect(fixture.git.isAncestor(fixture.directory, state.tasks.B.resultCommit!, "main")).toBe(true);
    }
  });
});
