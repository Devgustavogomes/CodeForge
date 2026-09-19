import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  select: vi.fn(),
}));

import { confirm, select } from "@inquirer/prompts";
import { Command } from "commander";
import {
  registerTaskDeleteCommand,
  taskDeleteAction,
} from "../../../../src/cli/commands/task/delete.js";
import * as containerModule from "../../../../src/infrastructure/container.js";

describe("task delete CLI command", () => {
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

  function setup(
    result: unknown = {
      kind: "deleted",
      intentName: "alpha",
      taskId: "TASK-001",
      cleanedDependenciesCount: 2,
    },
  ) {
    const deleteTaskUseCase = { execute: vi.fn().mockReturnValue(result) };
    const listIntentsUseCase = {
      execute: vi.fn().mockReturnValue([
        { name: "alpha", title: "Alpha" },
        { name: "beta", title: "Beta" },
      ]),
    };
    const taskOperationsUseCase = {
      getAvailableTasks: vi.fn().mockReturnValue({
        kind: "tasks",
        tasks: [
          { id: "TASK-001", title: "Create feature" },
          { id: "TASK-002", title: "Test feature" },
        ],
      }),
    };
    const container = {
      configService: {
        loadConfig: vi.fn().mockReturnValue({ language: "en" }),
      },
      deleteTaskUseCase,
      listIntentsUseCase,
      taskOperationsUseCase,
    };
    vi.spyOn(containerModule, "createAppContainer").mockReturnValue(
      container as never,
    );
    return {
      container,
      deleteTaskUseCase,
      listIntentsUseCase,
      taskOperationsUseCase,
    };
  }

  it("deletes explicit arguments and reports dependency cleanup", async () => {
    const { deleteTaskUseCase } = setup();
    vi.mocked(confirm).mockResolvedValue(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await taskDeleteAction("alpha", "TASK-001");

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/TASK-001.*alpha|alpha.*TASK-001/),
        default: false,
      }),
    );
    expect(deleteTaskUseCase.execute).toHaveBeenCalledWith(
      "alpha",
      "TASK-001",
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Cleaned references from 2"),
    );
    expect(result).toEqual({ success: true });
    expect(process.exitCode).toBeUndefined();
  });

  it("prompts for the intent before the task and displays ID/title", async () => {
    const { deleteTaskUseCase, taskOperationsUseCase } = setup();
    vi.mocked(select)
      .mockResolvedValueOnce("alpha" as never)
      .mockResolvedValueOnce("TASK-002" as never);
    vi.mocked(confirm).mockResolvedValue(true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await taskDeleteAction();

    expect(select).toHaveBeenCalledTimes(2);
    expect(vi.mocked(select).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        choices: expect.arrayContaining([
          expect.objectContaining({ value: "back" }),
          expect.objectContaining({ value: "alpha" }),
        ]),
      }),
    );
    expect(vi.mocked(select).mock.calls[1][0]).toEqual(
      expect.objectContaining({
        choices: expect.arrayContaining([
          expect.objectContaining({
            name: "TASK-002: Test feature",
            value: "TASK-002",
          }),
        ]),
      }),
    );
    expect(taskOperationsUseCase.getAvailableTasks).toHaveBeenCalledWith(
      "alpha",
    );
    expect(deleteTaskUseCase.execute).toHaveBeenCalledWith(
      "alpha",
      "TASK-002",
    );
  });

  it("returns without deleting when Back is selected for the intent", async () => {
    const { deleteTaskUseCase, taskOperationsUseCase } = setup();
    vi.mocked(select).mockResolvedValue("back" as never);

    const result = await taskDeleteAction();

    expect(result).toEqual({ back: true });
    expect(taskOperationsUseCase.getAvailableTasks).not.toHaveBeenCalled();
    expect(deleteTaskUseCase.execute).not.toHaveBeenCalled();
  });

  it("returns without deleting when Back is selected for the task", async () => {
    const { deleteTaskUseCase } = setup();
    vi.mocked(select).mockResolvedValue("back" as never);

    const result = await taskDeleteAction("alpha");

    expect(result).toEqual({ back: true });
    expect(deleteTaskUseCase.execute).not.toHaveBeenCalled();
  });

  it("returns without deleting when confirmation is rejected", async () => {
    const { deleteTaskUseCase } = setup();
    vi.mocked(confirm).mockResolvedValue(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await taskDeleteAction("alpha", "TASK-001");

    expect(result).toEqual({ back: true });
    expect(deleteTaskUseCase.execute).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("cancelled"));
    expect(process.exitCode).toBeUndefined();
  });

  it("treats prompt cancellation as a non-destructive return", async () => {
    const { deleteTaskUseCase } = setup();
    const cancellation = new Error("cancelled");
    cancellation.name = "ExitPromptError";
    vi.mocked(confirm).mockRejectedValue(cancellation);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await taskDeleteAction("alpha", "TASK-001");

    expect(result).toEqual({ back: true });
    expect(deleteTaskUseCase.execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("uses --force only to skip confirmation while retaining both prompts", async () => {
    const { deleteTaskUseCase } = setup();
    vi.mocked(select)
      .mockResolvedValueOnce("alpha" as never)
      .mockResolvedValueOnce("TASK-001" as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await taskDeleteAction(undefined, undefined, {
      force: true,
    });

    expect(select).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
    expect(deleteTaskUseCase.execute).toHaveBeenCalledWith(
      "alpha",
      "TASK-001",
    );
    expect(result).toEqual({ success: true });
  });

  it.each([
    ["not-initialized", "not initialized"],
    ["intent-not-found", "Intent not found"],
    ["task-not-found", "Task not found"],
  ])("maps the %s result to a localized failure", async (kind, text) => {
    setup({ kind });
    vi.mocked(confirm).mockResolvedValue(true);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await taskDeleteAction("alpha", "TASK-404");

    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(expect.stringContaining(text));
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["intent-not-found", "Intent not found"],
    ["no-tasks", "No tasks are available"],
  ])("maps the task-list %s result without deleting", async (kind, text) => {
    const { deleteTaskUseCase, taskOperationsUseCase } = setup();
    taskOperationsUseCase.getAvailableTasks.mockReturnValue({ kind });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await taskDeleteAction("alpha");

    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(expect.stringContaining(text));
    expect(deleteTaskUseCase.execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reports thrown filesystem errors and sets a failure exit code", async () => {
    const { deleteTaskUseCase } = setup();
    deleteTaskUseCase.execute.mockImplementation(() => {
      throw new Error("EPERM: operation not permitted");
    });
    vi.mocked(confirm).mockResolvedValue(true);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await taskDeleteAction("alpha", "TASK-001");

    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/TASK-001.*EPERM: operation not permitted/s),
    );
    expect(process.exitCode).toBe(1);
  });

  it("registers delete and rm with force parsing", async () => {
    const { deleteTaskUseCase } = setup();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const deleteProgram = new Command();
    registerTaskDeleteCommand(deleteProgram.command("task"));
    await deleteProgram.parseAsync([
      "node",
      "codeforge",
      "task",
      "delete",
      "alpha",
      "TASK-001",
      "--force",
    ]);

    const rmProgram = new Command();
    registerTaskDeleteCommand(rmProgram.command("task"));
    await rmProgram.parseAsync([
      "node",
      "codeforge",
      "task",
      "rm",
      "beta",
      "TASK-002",
      "-f",
    ]);

    expect(confirm).not.toHaveBeenCalled();
    expect(deleteTaskUseCase.execute).toHaveBeenNthCalledWith(
      1,
      "alpha",
      "TASK-001",
    );
    expect(deleteTaskUseCase.execute).toHaveBeenNthCalledWith(
      2,
      "beta",
      "TASK-002",
    );
  });
});
