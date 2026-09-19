import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
}));

vi.mock("../../../src/cli/interactive.js", () => ({
  runInteractiveMenu: vi.fn(),
}));

import { select } from "@inquirer/prompts";
import { Command } from "commander";
import { registerRunCommand, runAction } from "../../../src/cli/commands/run.js";
import { runInteractiveMenu } from "../../../src/cli/interactive.js";
import { TerminalSchedulerReporter } from "../../../src/cli/ui/TerminalSchedulerReporter.js";
import * as containerModule from "../../../src/infrastructure/container.js";
import { CommandHookDispatcher } from "../../../src/infrastructure/hooks/CommandHookDispatcher.js";
import { NoopHookDispatcher } from "../../../src/infrastructure/hooks/NoopHookDispatcher.js";

describe("run CLI command", () => {
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  function setupContainerMock(options: {
    status?: "completed" | "failed" | "deadlock";
    hooks?: any;
    intents?: Array<{ name: string; title: string }>;
    language?: "en" | "pt" | "es";
    executorAgent?: string;
    environment?: string;
    shouldThrow?: boolean;
  } = {}) {
    const {
      status = "completed",
      hooks = undefined,
      intents = [{ name: "intent-a", title: "Intent A" }],
      language = "en",
      executorAgent = "test-agent",
      environment = "test-env",
      shouldThrow = false,
    } = options;

    const mockRunner = { execute: vi.fn() };
    const mockScheduler = {
      run: shouldThrow
        ? vi.fn().mockRejectedValue(new Error("Scheduler runtime fault"))
        : vi.fn().mockResolvedValue({ status, intentName: "intent-a" }),
    };

    const config = {
      language,
      environment,
      executorAgent,
      hooks,
    };

    const createTaskScheduler = vi.fn().mockReturnValue(mockScheduler);
    const runnerProvider = vi.fn().mockReturnValue(mockRunner);
    const listIntents = vi.fn().mockReturnValue(intents);
    const getIntentStatus = vi.fn().mockReturnValue({
      kind: "status",
      intentName: "intent-a",
      intentStatus: status,
      tasks: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const mockContainer = {
      configService: {
        loadConfig: vi.fn().mockReturnValue(config),
      },
      listIntentsUseCase: { execute: listIntents },
      getIntentStatusUseCase: { execute: getIntentStatus },
      runnerProvider,
      createTaskScheduler,
      processExecutor: { execute: vi.fn() },
    };

    vi.spyOn(containerModule, "createAppContainer").mockReturnValue(
      mockContainer as any,
    );

    return {
      mockContainer,
      mockScheduler,
      mockRunner,
      createTaskScheduler,
      runnerProvider,
      listIntents,
    };
  }

  it("executes TaskScheduler without mounting or calling runInteractiveMenu", async () => {
    const { mockScheduler, createTaskScheduler } = setupContainerMock();

    const result = await runAction("intent-a");

    expect(runInteractiveMenu).not.toHaveBeenCalled();
    expect(createTaskScheduler).toHaveBeenCalledTimes(1);
    expect(mockScheduler.run).toHaveBeenCalledWith("intent-a", "test-agent");
    expect(result).toEqual({ success: true });
    expect(process.exitCode).toBe(0);
  });

  it("passes runner, config, TerminalSchedulerReporter, hook dispatcher, and executor model to container factory", async () => {
    const { createTaskScheduler, mockRunner, mockScheduler } = setupContainerMock({
      environment: "antigravity",
      executorAgent: "custom-executor",
    });

    await runAction("intent-a");

    expect(createTaskScheduler).toHaveBeenCalledWith(
      mockRunner,
      expect.objectContaining({
        environment: "antigravity",
        executorAgent: "custom-executor",
      }),
      expect.any(TerminalSchedulerReporter),
      expect.any(NoopHookDispatcher),
    );
    expect(mockScheduler.run).toHaveBeenCalledWith("intent-a", "custom-executor");
  });

  it("chooses CommandHookDispatcher when hooks are configured", async () => {
    const { createTaskScheduler } = setupContainerMock({
      hooks: {
        "task.verify": [
          { name: "lint", command: "npm run lint", type: "gate" },
        ],
      },
    });

    await runAction("intent-a");

    expect(createTaskScheduler).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.any(TerminalSchedulerReporter),
      expect.any(CommandHookDispatcher),
    );
  });

  it("chooses NoopHookDispatcher when hooks are not configured", async () => {
    const { createTaskScheduler } = setupContainerMock({
      hooks: undefined,
    });

    await runAction("intent-a");

    expect(createTaskScheduler).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.any(TerminalSchedulerReporter),
      expect.any(NoopHookDispatcher),
    );
  });

  it("prompts for intent when omitted and runs chosen intent", async () => {
    const { mockScheduler } = setupContainerMock({
      intents: [
        { name: "intent-a", title: "Intent A" },
        { name: "intent-b", title: "Intent B" },
      ],
    });

    vi.mocked(select).mockResolvedValue("intent-b");

    const result = await runAction();

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select an intent to execute:",
        choices: [
          { name: "<- Back", value: "back" },
          { name: "intent-a", value: "intent-a" },
          { name: "intent-b", value: "intent-b" },
        ],
      }),
    );
    expect(mockScheduler.run).toHaveBeenCalledWith("intent-b", "test-agent");
    expect(result).toEqual({ success: true });
    expect(process.exitCode).toBe(0);
  });

  it("starts no scheduler and returns back when user chooses Back in intent selection", async () => {
    const { createTaskScheduler, mockScheduler } = setupContainerMock();

    vi.mocked(select).mockResolvedValue("back");

    const result = await runAction();

    expect(result).toEqual({ back: true });
    expect(createTaskScheduler).not.toHaveBeenCalled();
    expect(mockScheduler.run).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("displays translated error and sets exit code 1 when no intents exist and intent was omitted", async () => {
    const { createTaskScheduler } = setupContainerMock({ intents: [] });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await runAction();

    expect(consoleError).toHaveBeenCalledWith("\n[x] No intents found.\n");
    expect(createTaskScheduler).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false });
    expect(process.exitCode).toBe(1);
  });

  it("sets exit code 1 when execution fails", async () => {
    setupContainerMock({ status: "failed" });

    const result = await runAction("intent-a");

    expect(result).toEqual({ success: false });
    expect(process.exitCode).toBe(1);
  });

  it("sets exit code 1 when execution deadlocks", async () => {
    setupContainerMock({ status: "deadlock" });

    const result = await runAction("intent-a");

    expect(result).toEqual({ success: false });
    expect(process.exitCode).toBe(1);
  });

  it("catches unhandled scheduler exceptions, logs error, and sets exit code 1", async () => {
    setupContainerMock({ shouldThrow: true });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await runAction("intent-a");

    expect(consoleError).toHaveBeenCalledWith("Execution error: Scheduler runtime fault");
    expect(result).toEqual({ success: false });
    expect(process.exitCode).toBe(1);
  });

  it("registers run command in Commander and executes runAction", async () => {
    const { mockScheduler } = setupContainerMock();

    const program = new Command();
    registerRunCommand(program);

    await program.parseAsync(["node", "codeforge", "run", "auth-intent"]);

    expect(mockScheduler.run).toHaveBeenCalledWith("auth-intent", "test-agent");
    expect(runInteractiveMenu).not.toHaveBeenCalled();
  });
});
