import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerRunCommand, runAction } from "../../../src/cli/commands/run.js";
import * as interactiveModule from "../../../src/cli/interactive.js";

describe("run CLI command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("launches the modern Ink TUI on the 'run' tab with initialSpec set to the provided spec", async () => {
    const runInteractiveSpy = vi
      .spyOn(interactiveModule, "runInteractiveMenu")
      .mockResolvedValue(undefined);

    const result = await runAction("spec-a");

    expect(runInteractiveSpy).toHaveBeenCalledTimes(1);
    expect(runInteractiveSpy).toHaveBeenCalledWith({
      initialTab: "run",
      initialSpec: "spec-a",
      autoStart: true,
    });
    expect(result).toEqual({ success: true });
  });

  it("launches the modern Ink TUI on the 'run' tab without spec when no spec is provided", async () => {
    const runInteractiveSpy = vi
      .spyOn(interactiveModule, "runInteractiveMenu")
      .mockResolvedValue(undefined);

    const result = await runAction();

    expect(runInteractiveSpy).toHaveBeenCalledTimes(1);
    expect(runInteractiveSpy).toHaveBeenCalledWith({
      initialTab: "run",
      initialSpec: undefined,
      autoStart: true,
    });
    expect(result).toEqual({ success: true });
  });

  it("registers run command in Commander and executes runAction", async () => {
    const runInteractiveSpy = vi
      .spyOn(interactiveModule, "runInteractiveMenu")
      .mockResolvedValue(undefined);

    const program = new Command();
    registerRunCommand(program);

    await program.parseAsync(["node", "codeforge", "run", "auth-spec"]);

    expect(runInteractiveSpy).toHaveBeenCalledWith({
      initialTab: "run",
      initialSpec: "auth-spec",
      autoStart: true,
    });
  });
});
