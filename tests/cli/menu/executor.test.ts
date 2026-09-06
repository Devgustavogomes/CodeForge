import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
}));

import { executeAction } from "../../../src/cli/menu/executor.js";
import * as initCmd from "../../../src/cli/commands/init.js";
import * as configCmd from "../../../src/cli/commands/config.js";
import * as runCmd from "../../../src/cli/commands/run.js";
import * as statusCmd from "../../../src/cli/commands/status.js";
import * as specCreateCmd from "../../../src/cli/commands/spec/create.js";
import * as specPullCmd from "../../../src/cli/commands/spec/pull.js";
import * as planGenerateCmd from "../../../src/cli/commands/plan/generate.js";
import * as planValidateCmd from "../../../src/cli/commands/plan/validate.js";
import * as taskInfoCmd from "../../../src/cli/commands/task/info.js";
import * as taskCompleteCmd from "../../../src/cli/commands/task/complete.js";
import * as taskRetryCmd from "../../../src/cli/commands/task/retry.js";
import * as taskResetCmd from "../../../src/cli/commands/task/reset.js";
import * as docsCreateCmd from "../../../src/cli/commands/docs/create.js";
import * as docsUpdateCmd from "../../../src/cli/commands/docs/update.js";
import { input } from "@inquirer/prompts";

describe("menu executor (in-process)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches 'init' command directly in-process", async () => {
    const spy = vi.spyOn(initCmd, "initAction").mockResolvedValue({ success: true });
    const result = await executeAction({ type: "command", args: ["init"] });
    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("dispatches 'config' command directly in-process", async () => {
    const spy = vi.spyOn(configCmd, "configAction").mockResolvedValue({ back: true });
    const result = await executeAction({ type: "command", args: ["config"] });
    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({ back: true });
  });

  it("dispatches 'run' command with arguments in-process", async () => {
    const spy = vi.spyOn(runCmd, "runAction").mockResolvedValue({ success: true });
    const result = await executeAction({ type: "command", args: ["run", "my-spec"] });
    expect(spy).toHaveBeenCalledWith("my-spec");
    expect(result).toEqual({ success: true });
  });

  it("dispatches 'status' command in-process", async () => {
    const spy = vi.spyOn(statusCmd, "statusAction").mockResolvedValue({ success: true });
    const result = await executeAction({ type: "command", args: ["status"] });
    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("dispatches 'spec create' in-process", async () => {
    const spy = vi.spyOn(specCreateCmd, "specCreateAction").mockResolvedValue({ success: true });
    const result = await executeAction({ type: "command", args: ["spec", "create", "test-feat"] });
    expect(spy).toHaveBeenCalledWith("test-feat");
    expect(result).toEqual({ success: true });
  });

  it("dispatches 'spec pull' in-process", async () => {
    const spy = vi.spyOn(specPullCmd, "specPullAction").mockResolvedValue({ success: true });
    const result = await executeAction({ type: "command", args: ["spec", "pull", "linear-123"] });
    expect(spy).toHaveBeenCalledWith("linear-123");
    expect(result).toEqual({ success: true });
  });

  it("dispatches 'plan generate' in-process", async () => {
    const spy = vi.spyOn(planGenerateCmd, "planGenerateAction").mockResolvedValue({ back: true });
    const result = await executeAction({ type: "command", args: ["plan", "generate"] });
    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({ back: true });
  });

  it("dispatches 'plan validate' in-process", async () => {
    const spy = vi.spyOn(planValidateCmd, "planValidateAction").mockResolvedValue({ success: true });
    const result = await executeAction({ type: "command", args: ["plan", "validate", "my-spec"] });
    expect(spy).toHaveBeenCalledWith("my-spec", undefined);
    expect(result).toEqual({ success: true });
  });

  it("dispatches 'task info' in-process", async () => {
    const spy = vi.spyOn(taskInfoCmd, "taskInfoAction").mockResolvedValue({ success: true });
    const result = await executeAction({ type: "command", args: ["task", "info"] });
    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("dispatches 'task complete' in-process", async () => {
    const spy = vi.spyOn(taskCompleteCmd, "taskCompleteAction").mockResolvedValue({ success: true });
    const result = await executeAction({ type: "command", args: ["task", "complete"] });
    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("dispatches 'task retry' in-process", async () => {
    const spy = vi.spyOn(taskRetryCmd, "taskRetryAction").mockResolvedValue({ success: true });
    const result = await executeAction({ type: "command", args: ["task", "retry"] });
    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("dispatches 'task reset' in-process", async () => {
    const spy = vi.spyOn(taskResetCmd, "taskResetAction").mockResolvedValue({ back: true });
    const result = await executeAction({ type: "command", args: ["task", "reset"] });
    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({ back: true });
  });

  it("dispatches 'docs create' in-process", async () => {
    const spy = vi.spyOn(docsCreateCmd, "docsCreateAction").mockResolvedValue({ success: true });
    const result = await executeAction({ type: "command", args: ["docs", "create"] });
    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("dispatches 'docs update' with command-with-input", async () => {
    vi.mocked(input).mockResolvedValue("api-guide");
    const spy = vi.spyOn(docsUpdateCmd, "docsUpdateAction").mockResolvedValue({ success: true });

    const result = await executeAction({
      type: "command-with-input",
      args: ["docs", "update"],
      inputLabel: "Doc name:",
      inputFlag: "--doc",
    });

    expect(spy).toHaveBeenCalledWith(undefined, { doc: "api-guide" });
    expect(result).toEqual({ success: true });
  });

  it("returns { success: false } if command-with-input is empty", async () => {
    vi.mocked(input).mockResolvedValue("   ");
    const spy = vi.spyOn(docsUpdateCmd, "docsUpdateAction");

    const result = await executeAction({
      type: "command-with-input",
      args: ["docs", "update"],
      inputLabel: "Doc name:",
      inputFlag: "--doc",
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false });
  });
});
