import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  select: vi.fn(),
}));

import { confirm, select } from "@inquirer/prompts";
import { Command } from "commander";
import {
  docsDeleteAction,
  registerDocsDeleteCommand,
} from "../../../../src/cli/commands/docs/delete.js";
import * as containerModule from "../../../../src/infrastructure/container.js";

describe("docs delete CLI command", () => {
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

  function setup(result: unknown = { kind: "deleted", docName: "api" }) {
    const deleteDocUseCase = { execute: vi.fn().mockReturnValue(result) };
    const docsManifestRepository = {
      load: vi.fn().mockReturnValue({
        version: "1.0",
        documents: {
          guide: { path: ".codeforge/docs/guide.md" },
          api: { path: ".codeforge/docs/api.md" },
        },
      }),
    };
    const container = {
      configService: {
        loadConfig: vi.fn().mockReturnValue({ language: "en" }),
      },
      deleteDocUseCase,
      docsManifestRepository,
    };
    vi.spyOn(containerModule, "createAppContainer").mockReturnValue(
      container as never,
    );
    return { container, deleteDocUseCase, docsManifestRepository };
  }

  it("deletes an explicit document after confirmation", async () => {
    const { deleteDocUseCase } = setup();
    vi.mocked(confirm).mockResolvedValue(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await docsDeleteAction("api");

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("api"),
        default: false,
      }),
    );
    expect(deleteDocUseCase.execute).toHaveBeenCalledWith("api");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("deleted successfully"),
    );
    expect(result).toEqual({ success: true });
    expect(process.exitCode).toBeUndefined();
  });

  it("lists sorted manifest documents with Back when name is omitted", async () => {
    const { deleteDocUseCase, docsManifestRepository } = setup();
    vi.mocked(select).mockResolvedValue("guide" as never);
    vi.mocked(confirm).mockResolvedValue(true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await docsDeleteAction();

    expect(docsManifestRepository.load).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [
          expect.objectContaining({ value: "back" }),
          expect.objectContaining({ value: "api" }),
          expect.objectContaining({ value: "guide" }),
        ],
      }),
    );
    expect(deleteDocUseCase.execute).toHaveBeenCalledWith("guide");
  });

  it("returns without deleting when Back is selected", async () => {
    const { deleteDocUseCase } = setup();
    vi.mocked(select).mockResolvedValue("back" as never);

    const result = await docsDeleteAction();

    expect(result).toEqual({ back: true });
    expect(confirm).toHaveBeenCalledTimes(0);
    expect(deleteDocUseCase.execute).toHaveBeenCalledTimes(0);
  });

  it("returns without deleting when confirmation is rejected", async () => {
    const { deleteDocUseCase } = setup();
    vi.mocked(confirm).mockResolvedValue(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await docsDeleteAction("api");

    expect(result).toEqual({ back: true });
    expect(deleteDocUseCase.execute).toHaveBeenCalledTimes(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("cancelled"));
    expect(process.exitCode).toBeUndefined();
  });

  it("treats prompt cancellation as a non-destructive return", async () => {
    const { deleteDocUseCase } = setup();
    const cancellation = new Error("cancelled");
    cancellation.name = "ExitPromptError";
    vi.mocked(select).mockRejectedValue(cancellation);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await docsDeleteAction();

    expect(result).toEqual({ back: true });
    expect(deleteDocUseCase.execute).toHaveBeenCalledTimes(0);
    expect(process.exitCode).toBeUndefined();
  });

  it("still selects an omitted target with --force but skips confirmation", async () => {
    const { deleteDocUseCase } = setup();
    vi.mocked(select).mockResolvedValue("api" as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await docsDeleteAction(undefined, { force: true });

    expect(select).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledTimes(0);
    expect(deleteDocUseCase.execute).toHaveBeenCalledWith("api");
    expect(result).toEqual({ success: true });
  });

  it("fails cleanly when the manifest has no registered documents", async () => {
    const { deleteDocUseCase, docsManifestRepository } = setup();
    docsManifestRepository.load.mockReturnValue({
      version: "1.0",
      documents: {},
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await docsDeleteAction();

    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("No documents are available"),
    );
    expect(deleteDocUseCase.execute).toHaveBeenCalledTimes(0);
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["not-initialized", "not initialized"],
    ["doc-not-found", "Document not found"],
  ])("maps the %s result to a localized failure", async (kind, text) => {
    setup({ kind });
    vi.mocked(confirm).mockResolvedValue(true);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await docsDeleteAction("missing");

    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(expect.stringContaining(text));
    expect(process.exitCode).toBe(1);
  });

  it("reports thrown filesystem errors and sets a failure exit code", async () => {
    const { deleteDocUseCase } = setup();
    deleteDocUseCase.execute.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });
    vi.mocked(confirm).mockResolvedValue(true);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await docsDeleteAction("api");

    expect(result).toEqual({ success: false });
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/api.*EACCES: permission denied/s),
    );
    expect(process.exitCode).toBe(1);
  });

  it("registers delete and rm with force parsing", async () => {
    const { deleteDocUseCase } = setup();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const deleteProgram = new Command();
    registerDocsDeleteCommand(deleteProgram.command("docs"));
    await deleteProgram.parseAsync([
      "node",
      "codeforge",
      "docs",
      "delete",
      "api",
      "--force",
    ]);

    const rmProgram = new Command();
    registerDocsDeleteCommand(rmProgram.command("docs"));
    await rmProgram.parseAsync([
      "node",
      "codeforge",
      "docs",
      "rm",
      "guide",
      "-f",
    ]);

    expect(confirm).toHaveBeenCalledTimes(0);
    expect(deleteDocUseCase.execute).toHaveBeenNthCalledWith(1, "api");
    expect(deleteDocUseCase.execute).toHaveBeenNthCalledWith(2, "guide");
  });
});
