import { afterEach, describe, expect, it, vi } from "vitest";
import { taskCompleteAction } from "../../../../src/cli/commands/task/complete.js";
import { taskResetAction } from "../../../../src/cli/commands/task/reset.js";
import { taskRetryAction } from "../../../../src/cli/commands/task/retry.js";

const previousExitCode = process.exitCode;
afterEach(() => { process.exitCode = previousExitCode; vi.restoreAllMocks(); });

describe("task operation CLI protections", () => {
  it.each(["complete", "reset", "retry"])("reports a blocked %s without claiming success or starting execution", async action => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const blocked = { kind: "blocked", message: "Preserve worktree; inspect previous processes before retrying." };
    const container = {
      configService: { loadConfig: () => ({ language: "en", environment: "test" }) },
      gw: { exists: () => true },
      taskOperationsUseCase: {
        markTaskCompleted: () => blocked, resetTasks: () => blocked,
        retryIntent: vi.fn().mockResolvedValue(blocked),
      },
      createTaskScheduler: vi.fn(),
    };
    const result = action === "complete" ? await taskCompleteAction("intent", "TASK-001", container as never) :
      action === "reset" ? await taskResetAction("intent", "TASK-001", container as never) :
      await taskRetryAction("intent", container as never);
    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(expect.stringContaining(blocked.message));
    expect(log).not.toHaveBeenCalled();
    expect(container.createTaskScheduler).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
