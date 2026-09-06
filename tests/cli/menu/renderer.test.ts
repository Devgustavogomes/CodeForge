import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("../../../src/cli/menu/executor.js", () => ({
  executeAction: vi.fn(),
}));

import { renderMainMenu } from "../../../src/cli/menu/renderer.js";
import { select } from "@inquirer/prompts";
import { executeAction } from "../../../src/cli/menu/executor.js";

describe("menu renderer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exits with 0 when 'exit' is selected", async () => {
    vi.mocked(select).mockResolvedValueOnce("exit");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    await renderMainMenu();

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("returns to previous group when action returns { back: true }", async () => {
    // 1st select: choose "plan"
    // 2nd select: choose "plan generate"
    // executeAction returns { back: true }
    // 3rd select: inside "plan" group again, choose "back"
    // 4th select: choose "exit"
    vi.mocked(select)
      .mockResolvedValueOnce("plan")
      .mockResolvedValueOnce("plan generate")
      .mockResolvedValueOnce("back")
      .mockResolvedValueOnce("exit");

    vi.mocked(executeAction).mockResolvedValueOnce({ back: true });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    await renderMainMenu();

    expect(executeAction).toHaveBeenCalledWith({
      type: "command",
      args: ["plan", "generate"],
    });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("loops to main menu when action completes normally", async () => {
    // 1st select: choose "run"
    // executeAction completes with { success: true }
    // 2nd select: choose "exit"
    vi.mocked(select)
      .mockResolvedValueOnce("run")
      .mockResolvedValueOnce("exit");

    vi.mocked(executeAction).mockResolvedValueOnce({ success: true });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    await renderMainMenu();

    expect(executeAction).toHaveBeenCalledWith({
      type: "command",
      args: ["run"],
    });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
