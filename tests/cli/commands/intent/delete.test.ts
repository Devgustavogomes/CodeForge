import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  select: vi.fn(),
}));

import { confirm, select } from "@inquirer/prompts";
import { Command } from "commander";
import {
  registerIntentDeleteCommand,
  intentDeleteAction,
} from "../../../../src/cli/commands/intent/delete.js";
import * as containerModule from "../../../../src/infrastructure/container.js";

describe("intent delete CLI command", () => {
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

  function setup(result: unknown = { kind: "deleted", intentName: "alpha" }) {
    const deleteIntentUseCase = { execute: vi.fn().mockReturnValue(result) };
    const listIntentsUseCase = {
      execute: vi.fn().mockReturnValue([
        { name: "alpha", title: "Alpha" },
        { name: "beta", title: "Beta" },
      ]),
    };
    const container = {
      configService: {
        loadConfig: vi.fn().mockReturnValue({ language: "en" }),
      },
      deleteIntentUseCase,
      listIntentsUseCase,
    };
    vi.spyOn(containerModule, "createAppContainer").mockReturnValue(
      container as never,
    );
    return { container, deleteIntentUseCase, listIntentsUseCase };
  }

  it("deletes an explicit intent after confirmation", async () => {
    const { deleteIntentUseCase } = setup();
    vi.mocked(confirm).mockResolvedValue(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await intentDeleteAction("alpha");

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("alpha"),
        default: false,
      }),
    );
    expect(deleteIntentUseCase.execute).toHaveBeenCalledWith("alpha");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("deleted successfully"),
    );
    expect(result).toEqual({ success: true });
    expect(process.exitCode).toBeUndefined();
  });

  it("prompts for an omitted intent and includes Back", async () => {
    const { deleteIntentUseCase } = setup();
    vi.mocked(select).mockResolvedValue("beta" as never);
    vi.mocked(confirm).mockResolvedValue(true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await intentDeleteAction();

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: expect.arrayContaining([
          expect.objectContaining({ value: "back" }),
          expect.objectContaining({ value: "alpha" }),
          expect.objectContaining({ value: "beta" }),
        ]),
      }),
    );
    expect(deleteIntentUseCase.execute).toHaveBeenCalledWith("beta");
  });

  it("returns without deleting when Back is selected", async () => {
    const { deleteIntentUseCase } = setup();
    vi.mocked(select).mockResolvedValue("back" as never);

    const result = await intentDeleteAction();

    expect(result).toEqual({ back: true });
    expect(confirm).toHaveBeenCalledTimes(0);
    expect(deleteIntentUseCase.execute).toHaveBeenCalledTimes(0);
    expect(process.exitCode).toBeUndefined();
  });

  it("returns without deleting when confirmation is rejected", async () => {
    const { deleteIntentUseCase } = setup();
    vi.mocked(confirm).mockResolvedValue(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await intentDeleteAction("alpha");

    expect(result).toEqual({ back: true });
    expect(deleteIntentUseCase.execute).toHaveBeenCalledTimes(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("cancelled"));
    expect(process.exitCode).toBeUndefined();
  });

  it("treats prompt cancellation as a non-destructive return", async () => {
    const { deleteIntentUseCase } = setup();
    const cancellation = new Error("cancelled");
    cancellation.name = "ExitPromptError";
    vi.mocked(select).mockRejectedValue(cancellation);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await intentDeleteAction();

    expect(result).toEqual({ back: true });
    expect(deleteIntentUseCase.execute).toHaveBeenCalledTimes(0);
    expect(process.exitCode).toBeUndefined();
  });

  it("still selects an omitted target with --force but skips confirmation", async () => {
    const { deleteIntentUseCase } = setup();
    vi.mocked(select).mockResolvedValue("alpha" as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await intentDeleteAction(undefined, { force: true });

    expect(select).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledTimes(0);
    expect(deleteIntentUseCase.execute).toHaveBeenCalledWith("alpha");
    expect(result).toEqual({ success: true });
  });

  it.each([
    ["not-initialized", "not initialized"],
    ["intent-not-found", "Intent not found"],
  ])("maps the %s result to a localized failure", async (kind, text) => {
    setup({ kind });
    vi.mocked(confirm).mockResolvedValue(true);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await intentDeleteAction("missing");

    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(expect.stringContaining(text));
    expect(process.exitCode).toBe(1);
  });

  it("reports thrown filesystem errors and sets a failure exit code", async () => {
    const { deleteIntentUseCase } = setup();
    deleteIntentUseCase.execute.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });
    vi.mocked(confirm).mockResolvedValue(true);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await intentDeleteAction("alpha");

    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/alpha.*EACCES: permission denied/s),
    );
    expect(process.exitCode).toBe(1);
  });

  it("registers delete and rm with force parsing", async () => {
    const { deleteIntentUseCase } = setup();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const deleteProgram = new Command();
    registerIntentDeleteCommand(deleteProgram.command("intent"));
    await deleteProgram.parseAsync([
      "node",
      "codeforge",
      "intent",
      "delete",
      "alpha",
      "--force",
    ]);

    const rmProgram = new Command();
    registerIntentDeleteCommand(rmProgram.command("intent"));
    await rmProgram.parseAsync([
      "node",
      "codeforge",
      "intent",
      "rm",
      "beta",
      "-f",
    ]);

    expect(confirm).toHaveBeenCalledTimes(0);
    expect(deleteIntentUseCase.execute).toHaveBeenNthCalledWith(1, "alpha");
    expect(deleteIntentUseCase.execute).toHaveBeenNthCalledWith(2, "beta");
  });
});
