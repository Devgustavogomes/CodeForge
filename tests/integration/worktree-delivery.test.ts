import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { WorktreeRepository } from "../helpers/worktree-repository.js";
import { TaskBuilder } from "../helpers/task-builder.js";
import { CleanupCoordinator } from "../../src/scheduler/CleanupCoordinator.js";
import { DeliveryCoordinator } from "../../src/scheduler/DeliveryCoordinator.js";
import { ExecuteReviewUseCase } from "../../src/application/use-cases/ExecuteReviewUseCase.js";
import { ValidatePlanUseCase } from "../../src/application/use-cases/ValidatePlanUseCase.js";

let fixture: WorktreeRepository;
afterEach(() => fixture?.dispose());
const task = TaskBuilder.aTask().withId("A").build();

describe("real worktree delivery and cleanup", { timeout: 60000 }, () => {
  it.each(["dirty", "untracked", "commit", "branch"])("protects the original checkout after a user %s change", async change => {
    fixture = new WorktreeRepository([task]);
    fixture.agent = async context => {
      fixture.write(context.cwd, "result.txt", "approved");
      if (change === "dirty" || change === "commit") fixture.write(fixture.directory, "shared.txt", "user edit");
      if (change === "untracked") fixture.write(fixture.directory, "user.txt", "user untracked");
      if (change === "commit") {
        fixture.command(fixture.directory, "add", ".");
        fixture.command(fixture.directory, "commit", "-m", "user commit");
      }
      if (change === "branch") fixture.command(fixture.directory, "checkout", "-b", "user-branch");
    };
    expect((await fixture.scheduler().run(fixture.intent, { skipReview: true })).status).toBe("paused");
    const state = fixture.state();
    expect(state.delivery!.status).toBe("pending");
    expect(state.tasks.A.integration!.status).toBe("succeeded");
    expect(fixture.read(state.integrationWorktreePath!, "result.txt")).toBe("approved");
    expect(existsSync(state.tasks.A.worktreePath!)).toBe(true);
    expect(existsSync(state.integrationWorktreePath!)).toBe(true);
    expect(fixture.verifyCalls()).toHaveLength(1);
    if (change === "dirty" || change === "commit") expect(fixture.read(fixture.directory, "shared.txt")).toBe("user edit");
    if (change === "untracked") expect(fixture.read(fixture.directory, "user.txt")).toBe("user untracked");
    if (change === "branch") expect(fixture.command(fixture.directory, "branch", "--show-current")).toBe("user-branch");
    if (change === "commit") expect(fixture.command(fixture.directory, "log", "-1", "--format=%s")).toBe("user commit");
    expect(existsSync(fixture.directory + "/result.txt")).toBe(false);
  });

  it.each(["dirty", "untracked", "process", "identity"])("preserves a %s task artifact while cleaning other eligible worktrees and retaining refs", async condition => {
    fixture = new WorktreeRepository([task]);
    const initial = await fixture.scheduler({ cleanupCoordinator: fixture.keepWorktrees }).run(fixture.intent, { skipReview: true });
    expect(initial.status, JSON.stringify(initial)).toBe("completed");
    const state = fixture.state();
    const record = state.tasks.A;
    const foreign = fixture.git.createWorktree(fixture.directory, "foreign", "task", state.originalCommit!);
    fixture.write(foreign.directory, "foreign.txt", "unrelated work");
    if (condition === "dirty") fixture.write(record.worktreePath!, "A.txt", "pending edits");
    if (condition === "untracked") fixture.write(record.worktreePath!, "pending.txt", "pending new file");
    if (condition === "identity") fixture.command(record.worktreePath!, "checkout", "--detach");
    if (condition === "process") fixture.occupancy.mockImplementation(async (_intent, _processes, filter) => ({
      status: filter?.cwd === record.worktreePath ? "active" : "interrupted",
      safeToReuse: filter?.cwd !== record.worktreePath, processes: [], diagnostics: ["controlled occupancy"],
    }));
    const cleanup = new CleanupCoordinator(fixture.repo, fixture.git, fixture.processes);
    const result = await cleanup.cleanup(fixture.intent);
    expect(result.failures, result.failures.join("\n")).toHaveLength(1);
    expect(existsSync(record.worktreePath!)).toBe(true);
    expect(existsSync(state.integrationWorktreePath!)).toBe(false);
    expect(fixture.read(foreign.directory, "foreign.txt")).toBe("unrelated work");
    expect(fixture.command(fixture.directory, "rev-parse", record.branch!)).toBe(record.resultCommit);
    expect(fixture.git.isAncestor(fixture.directory, record.resultCommit!, "main")).toBe(true);
    expect(fixture.state().delivery!.status).toBe("succeeded");
    expect(fixture.verifyCalls()).toHaveLength(1);
  });

  it("recovers delivery after the branch update succeeds before the state outcome is saved", async () => {
    fixture = new WorktreeRepository([task]);
    fixture.agent = async context => {
      fixture.write(context.cwd, "A.txt", "accepted");
      fixture.write(fixture.directory, "user.txt", "temporarily blocks delivery");
    };
    await fixture.scheduler().run(fixture.intent, { skipReview: true });
    fixture.command(fixture.directory, "clean", "-f", "--", "user.txt");
    const update = fixture.git.updateOriginalBranch.bind(fixture.git);
    let calls = 0;
    fixture.git.updateOriginalBranch = (...args) => {
      calls++;
      update(...args);
      throw new Error("interrupted after branch update");
    };
    const delivery = new DeliveryCoordinator(fixture.repo, fixture.git);
    expect(delivery.deliver(fixture.intent, true).delivered).toBe(false);
    const delivered = fixture.command(fixture.directory, "rev-parse", "HEAD");
    expect(delivery.deliver(fixture.intent, true).delivered).toBe(true);
    expect(calls).toBe(1);
    expect(fixture.state().delivery!.deliveredCommit).toBe(delivered);
    expect((await new CleanupCoordinator(fixture.repo, fixture.git, fixture.processes).cleanup(fixture.intent)).failures).toEqual([]);
    expect(fixture.git.listWorktrees(fixture.directory)).toHaveLength(1);
    expect(fixture.verifyCalls()).toHaveLength(1);
  });

  it("reviews added-file commit diffs and isolates reviewer follow-up tasks on the accepted base", async () => {
    fixture = new WorktreeRepository([task]);
    const followup = TaskBuilder.aTask().withId("B").withDependencies(["A"]).build();
    let reviews = 0;
    const reviewer = { execute: async (context: { cwd: string; promptFilePath: string }) => {
      reviews++;
      expect(context.cwd).toBe(fixture.state().integrationWorktreePath);
      expect(fixture.command(fixture.directory, "diff")).toBe("");
      expect(fixture.read(context.cwd, context.promptFilePath)).toContain("A.txt");
      if (reviews === 1) fixture.addTask(followup);
    } };
    const reviewUseCase = new ExecuteReviewUseCase(fixture.gw, fixture.git, reviewer, fixture.prompt,
      { environment: "test", plannerAgent: "controlled", executorAgent: "controlled", language: "en" }, fixture.directory);
    const scheduler = () => fixture.scheduler({ reviewUseCase, validatePlanUseCase: new ValidatePlanUseCase(fixture.gw) });
    const reviewed = await scheduler().run(fixture.intent, { forceReview: true });
    expect(reviewed.status, JSON.stringify(reviewed)).toBe("pending");
    const accepted = fixture.state().lastAcceptedCommit;
    expect(existsSync(fixture.directory + "/A.txt")).toBe(false);
    expect((await scheduler().run(fixture.intent, { forceReview: true })).status).toBe("completed");
    expect(reviews).toBe(2);
    expect(fixture.state().tasks.B.baseCommit).toBe(accepted);
    expect(fixture.agents[1].cwd).not.toBe(fixture.agents[0].cwd);
    expect(fixture.read(fixture.directory, "B.txt")).toBe("accepted\n");
    expect(fixture.verifyCalls()).toHaveLength(2);
  });
});
