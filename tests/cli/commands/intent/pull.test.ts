import { describe, expect, it, vi } from "vitest";
import { intentPullAction } from "../../../../src/cli/commands/intent/pull.js";

describe("intent pull CLI", () => {
  it("reports a remote listing error instead of asking for an ID", async () => {
    const previousExitCode = process.exitCode;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const source = { name: "clickup", list: vi.fn().mockRejectedValue(new Error("ClickUp API request failed with status 404")) };
    const container = {
      configService: { loadConfig: () => ({ language: "en", intentSource: { provider: "clickup", project: "123" } }) },
      intentSourceFactory: { create: () => source },
    } as any;

    try {
      expect(await intentPullAction(undefined, undefined, container)).toEqual({ success: false });
      expect(error).toHaveBeenCalledWith(expect.stringContaining("ClickUp API request failed with status 404"));
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
      error.mockRestore();
    }
  });
});
