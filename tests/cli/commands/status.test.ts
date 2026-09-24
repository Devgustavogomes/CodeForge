import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
}));

vi.mock("../../../src/cli/interactive.js", () => ({
  runInteractiveMenu: vi.fn(),
}));

import { select } from "@inquirer/prompts";
import { Command } from "commander";
import * as containerModule from "../../../src/infrastructure/container.js";
import { runInteractiveMenu } from "../../../src/cli/interactive.js";
import {
  registerStatusCommand,
  statusAction,
} from "../../../src/cli/commands/status.js";

describe("status CLI command", () => {
  let originalExitCode: typeof process.exitCode;

  function setupContainerMock(
    statusResult: any,
    intents = [{ name: "intent-a", title: "Intent A" }],
    language = "en",
  ) {
    const executeStatus = vi.fn().mockReturnValue(statusResult);
    const listIntents = vi.fn().mockReturnValue(intents);
    const mockContainer = {
      getIntentStatusUseCase: { execute: executeStatus },
      listIntentsUseCase: { execute: listIntents },
      configService: {
        loadConfig: vi.fn().mockReturnValue({ language, environment: "test" }),
      },
    };

    vi.spyOn(containerModule, "createAppContainer").mockReturnValue(mockContainer as any);
    return { executeStatus, listIntents };
  }

  const statusResult = {
    kind: "status",
    intentName: "todo-api",
    intentStatus: "running",
    tasks: [
      {
        id: "TASK-001",
        title: "Setup",
        status: "completed",
        dependencies: [],
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:05.000Z",
      },
      {
        id: "TASK-002",
        title: "Routes",
        status: "running",
        dependencies: ["TASK-001"],
        startedAt: "2026-01-01T00:00:05.000Z",
      },
      {
        id: "TASK-003",
        title: "Tests",
        status: "pending",
        dependencies: ["TASK-002"],
      },
    ],
    updatedAt: "2026-01-01T00:00:15.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it("prints one status snapshot by default without launching the TUI", async () => {
    const { executeStatus } = setupContainerMock(statusResult);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await statusAction("todo-api");

    expect(executeStatus).toHaveBeenCalledWith("todo-api");
    expect(consoleLog).toHaveBeenCalledTimes(1);
    expect(runInteractiveMenu).toHaveBeenCalledTimes(0);
    expect(result).toEqual({ success: true });
    expect(process.exitCode).toBeUndefined();
  });

  it("keeps --once as a compatibility no-op with the same output", async () => {
    setupContainerMock(statusResult);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const defaultResult = await statusAction("todo-api");
    const defaultOutput = consoleLog.mock.calls[0][0];
    consoleLog.mockClear();

    const onceResult = await statusAction("todo-api", { once: true });

    expect(consoleLog.mock.calls[0][0]).toBe(defaultOutput);
    expect(defaultResult).toEqual({ success: true });
    expect(onceResult).toEqual({ success: true });
    expect(runInteractiveMenu).toHaveBeenCalledTimes(0);
  });

  it("prompts with a translated Back choice when the intent is omitted", async () => {
    const selectedResult = { ...statusResult, intentName: "selected-intent" };
    const { executeStatus } = setupContainerMock(
      selectedResult,
      [{ name: "selected-intent", title: "Selected Intent" }],
    );
    vi.mocked(select).mockResolvedValueOnce("selected-intent" as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await statusAction();

    expect(select).toHaveBeenCalledWith({
      message: "Select an intent to view status:",
      choices: [
        { name: "<- Back", value: "back" },
        { name: "selected-intent", value: "selected-intent" },
      ],
    });
    expect(executeStatus).toHaveBeenCalledWith("selected-intent");
    expect(result).toEqual({ success: true });
  });

  it("returns Back without requesting status when Back is selected", async () => {
    const { executeStatus } = setupContainerMock(statusResult);
    vi.mocked(select).mockResolvedValueOnce("back" as never);

    const result = await statusAction();

    expect(result).toEqual({ back: true });
    expect(executeStatus).toHaveBeenCalledTimes(0);
    expect(runInteractiveMenu).toHaveBeenCalledTimes(0);
  });

  it("fails when no intent is available for selection", async () => {
    const { executeStatus } = setupContainerMock(statusResult, []);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await statusAction();

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("No intents found"));
    expect(executeStatus).toHaveBeenCalledTimes(0);
    expect(result).toEqual({ success: false });
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["not-initialized", "CodeForge is not initialized"],
    ["intent-not-found", "Intent not found: missing-intent.md"],
  ])("maps %s to a localized failure and exit code 1", async (kind, message) => {
    setupContainerMock({ kind });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await statusAction("missing-intent");

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(result).toEqual({ success: false });
    expect(process.exitCode).toBe(1);
  });

  it("maps no-execution to localized successful output", async () => {
    setupContainerMock({ kind: "no-execution", intentName: "intent-a" });
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await statusAction("intent-a");

    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining("No execution started for intent 'intent-a'"),
    );
    expect(result).toEqual({ success: true });
    expect(process.exitCode).toBeUndefined();
  });

  it("registers default and --once forms as CLI snapshots", async () => {
    const { executeStatus } = setupContainerMock(statusResult);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = new Command();
    registerStatusCommand(program);

    await program.parseAsync(["node", "codeforge", "status", "todo-api"]);
    await program.parseAsync(["node", "codeforge", "status", "--once", "todo-api"]);

    expect(executeStatus).toHaveBeenCalledTimes(2);
    expect(runInteractiveMenu).toHaveBeenCalledTimes(0);
  });
});
