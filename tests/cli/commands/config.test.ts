import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  input: vi.fn(),
}));

import { input, select } from "@inquirer/prompts";
import { configAction } from "../../../src/cli/commands/config.js";
import * as containerModule from "../../../src/infrastructure/container.js";

describe("config CLI AI review settings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("selects a reviewer discovered from the active environment and validates rounds", async () => {
    const config = {
      language: "en" as const,
      environment: "test-env",
      plannerAgent: "planner",
      executorAgent: "executor",
    };
    const saveConfig = vi.fn();
    const getAgentsForEnvironment = vi.fn().mockResolvedValue(["reviewer-a", "reviewer-b"]);
    vi.spyOn(containerModule, "createAppContainer").mockReturnValue({
      configureEnvironmentUseCase: {
        loadConfig: vi.fn().mockReturnValue(config),
        saveConfig,
        getAgentsForEnvironment,
        getAvailableEnvironments: vi.fn(),
      },
    } as any);
    vi.mocked(select)
      .mockResolvedValueOnce("aiReview")
      .mockResolvedValueOnce("enabled")
      .mockResolvedValueOnce("reviewer-b")
      .mockResolvedValueOnce("back");
    vi.mocked(input).mockResolvedValueOnce("0").mockResolvedValueOnce("4");

    await configAction();

    expect(getAgentsForEnvironment).toHaveBeenCalledWith("test-env");
    expect(input).toHaveBeenCalledTimes(2);
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      aiReview: { enabled: true, agent: "reviewer-b", maxRounds: 4 },
    }));
  });
});
