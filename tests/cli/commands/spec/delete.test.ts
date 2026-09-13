import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  select: vi.fn(),
}));

import { confirm, select } from "@inquirer/prompts";
import { Command } from "commander";
import {
  registerSpecDeleteCommand,
  specDeleteAction,
} from "../../../../src/cli/commands/spec/delete.js";
import * as containerModule from "../../../../src/infrastructure/container.js";

describe("spec delete CLI command", () => {
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

  function setup(result: unknown = { kind: "deleted", specName: "alpha" }) {
    const deleteSpecUseCase = { execute: vi.fn().mockReturnValue(result) };
    const listSpecsUseCase = {
      execute: vi.fn().mockReturnValue([
        { name: "alpha", title: "Alpha" },
        { name: "beta", title: "Beta" },
      ]),
    };
    const container = {
      configService: {
        loadConfig: vi.fn().mockReturnValue({ language: "en" }),
      },
      deleteSpecUseCase,
      listSpecsUseCase,
    };
    vi.spyOn(containerModule, "createAppContainer").mockReturnValue(
      container as never,
    );
    return { container, deleteSpecUseCase, listSpecsUseCase };
  }

  it("deletes an explicit specification after confirmation", async () => {
    const { deleteSpecUseCase } = setup();
    vi.mocked(confirm).mockResolvedValue(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await specDeleteAction("alpha");

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("alpha"),
        default: false,
      }),
    );
    expect(deleteSpecUseCase.execute).toHaveBeenCalledWith("alpha");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("deleted successfully"),
    );
    expect(result).toEqual({ success: true });
    expect(process.exitCode).toBeUndefined();
  });

  it("prompts for an omitted specification and includes Back", async () => {
    const { deleteSpecUseCase } = setup();
    vi.mocked(select).mockResolvedValue("beta" as never);
    vi.mocked(confirm).mockResolvedValue(true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await specDeleteAction();

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: expect.arrayContaining([
          expect.objectContaining({ value: "back" }),
          expect.objectContaining({ value: "alpha" }),
          expect.objectContaining({ value: "beta" }),
        ]),
      }),
    );
    expect(deleteSpecUseCase.execute).toHaveBeenCalledWith("beta");
  });

  it("returns without deleting when Back is selected", async () => {
    const { deleteSpecUseCase } = setup();
    vi.mocked(select).mockResolvedValue("back" as never);

    const result = await specDeleteAction();

    expect(result).toEqual({ back: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(deleteSpecUseCase.execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("returns without deleting when confirmation is rejected", async () => {
    const { deleteSpecUseCase } = setup();
    vi.mocked(confirm).mockResolvedValue(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await specDeleteAction("alpha");

    expect(result).toEqual({ back: true });
    expect(deleteSpecUseCase.execute).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("cancelled"));
    expect(process.exitCode).toBeUndefined();
  });

  it("treats prompt cancellation as a non-destructive return", async () => {
    const { deleteSpecUseCase } = setup();
    const cancellation = new Error("cancelled");
    cancellation.name = "ExitPromptError";
    vi.mocked(select).mockRejectedValue(cancellation);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await specDeleteAction();

    expect(result).toEqual({ back: true });
    expect(deleteSpecUseCase.execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("still selects an omitted target with --force but skips confirmation", async () => {
    const { deleteSpecUseCase } = setup();
    vi.mocked(select).mockResolvedValue("alpha" as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await specDeleteAction(undefined, { force: true });

    expect(select).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
    expect(deleteSpecUseCase.execute).toHaveBeenCalledWith("alpha");
    expect(result).toEqual({ success: true });
  });

  it.each([
    ["not-initialized", "not initialized"],
    ["spec-not-found", "Specification not found"],
  ])("maps the %s result to a localized failure", async (kind, text) => {
    setup({ kind });
    vi.mocked(confirm).mockResolvedValue(true);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await specDeleteAction("missing");

    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(expect.stringContaining(text));
    expect(process.exitCode).toBe(1);
  });

  it("reports thrown filesystem errors and sets a failure exit code", async () => {
    const { deleteSpecUseCase } = setup();
    deleteSpecUseCase.execute.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });
    vi.mocked(confirm).mockResolvedValue(true);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await specDeleteAction("alpha");

    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/alpha.*EACCES: permission denied/s),
    );
    expect(process.exitCode).toBe(1);
  });

  it("registers delete and rm with force parsing", async () => {
    const { deleteSpecUseCase } = setup();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const deleteProgram = new Command();
    registerSpecDeleteCommand(deleteProgram.command("spec"));
    await deleteProgram.parseAsync([
      "node",
      "codeforge",
      "spec",
      "delete",
      "alpha",
      "--force",
    ]);

    const rmProgram = new Command();
    registerSpecDeleteCommand(rmProgram.command("spec"));
    await rmProgram.parseAsync([
      "node",
      "codeforge",
      "spec",
      "rm",
      "beta",
      "-f",
    ]);

    expect(confirm).not.toHaveBeenCalled();
    expect(deleteSpecUseCase.execute).toHaveBeenNthCalledWith(1, "alpha");
    expect(deleteSpecUseCase.execute).toHaveBeenNthCalledWith(2, "beta");
  });
});
