import { afterEach, describe, expect, it, vi } from "vitest";
import { taskRetryAction } from "../../../../src/cli/commands/task/retry.js";
import { TerminalSchedulerReporter } from "../../../../src/cli/ui/TerminalSchedulerReporter.js";
import { CliHookReporter } from "../../../../src/cli/ui/CliHookReporter.js";
import { CommandHookDispatcher } from "../../../../src/infrastructure/hooks/CommandHookDispatcher.js";

describe("task retry CLI", () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it("shows failed and already pending tasks and uses the run dashboard", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const execute = vi.fn().mockReturnValue({
      kind: "status",
      intentName: "demo",
      intentStatus: "pending",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [
        { id: "TASK-001", status: "pending", dependencies: [], title: "One" },
        { id: "TASK-002", status: "pending", dependencies: [], title: "Two" },
        { id: "TASK-003", status: "pending", dependencies: [], title: "Three" },
      ],
    });
    const scheduler = { run: vi.fn().mockResolvedValue({ status: "completed" }) };
    const createTaskScheduler = vi.fn().mockReturnValue(scheduler);
    const config = { language: "en", environment: "test", executorAgent: "agent", hooks: { "task.verify": [] } };
    const container = {
      configService: { loadConfig: () => config },
      gw: { exists: () => true },
      taskOperationsUseCase: { retryIntent: () => ({ kind: "retried", retriedTasks: ["TASK-001", "TASK-002"] }) },
      getIntentStatusUseCase: { execute },
      runnerProvider: vi.fn().mockReturnValue({}),
      processExecutor: {},
      createTaskScheduler,
    } as any;

    const result = await taskRetryAction("demo", container);

    expect(result).toEqual({ success: true });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Retrying 2 failed task(s) and resuming 1 pending task(s)"));
    const reporter = createTaskScheduler.mock.calls[0][2];
    const hooks = createTaskScheduler.mock.calls[0][3] as CommandHookDispatcher;
    expect(reporter).toBeInstanceOf(TerminalSchedulerReporter);
    expect(hooks.getReporter()).toBeInstanceOf(CliHookReporter);
    expect(scheduler.run).toHaveBeenCalledWith("demo", "agent");
  });
});
