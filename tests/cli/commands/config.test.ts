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

  it("adds, edits, and deletes hooks for an event", async () => {
    const config = { language: "en" as const, environment: "codex", plannerAgent: "p", executorAgent: "e", hooks: {} };
    const saved: unknown[] = [];
    const saveConfig = vi.fn((value) => saved.push(structuredClone(value)));
    const container = { configureEnvironmentUseCase: { loadConfig: () => config, saveConfig } } as any;
    vi.mocked(select)
      .mockResolvedValueOnce("hooks").mockResolvedValueOnce("task.verify")
      .mockResolvedValueOnce("add").mockResolvedValueOnce("gate")
      .mockResolvedValueOnce("edit:0").mockResolvedValueOnce("notify")
      .mockResolvedValueOnce("delete:0").mockResolvedValueOnce("yes")
      .mockResolvedValueOnce("back").mockResolvedValueOnce("back").mockResolvedValueOnce("back");
    vi.mocked(input)
      .mockResolvedValueOnce("npm test").mockResolvedValueOnce("tests")
      .mockResolvedValueOnce("npm run test").mockResolvedValueOnce("tests updated");

    await configAction(container);

    expect(saved).toHaveLength(3);
    expect((saved[0] as any).hooks["task.verify"]).toEqual([{ name: "tests", run: "npm test", type: "gate" }]);
    expect((saved[1] as any).hooks["task.verify"]).toEqual([{ name: "tests updated", run: "npm run test", type: "notify" }]);
    expect((saved[2] as any).hooks["task.verify"]).toEqual([]);
  });

  it("configures an intent source with the provider's default environment variable", async () => {
    const config = { language: "en" as const, environment: "codex", plannerAgent: "p", executorAgent: "e" };
    const saveConfig = vi.fn();
    const container = { configureEnvironmentUseCase: { loadConfig: () => config, saveConfig } } as any;
    vi.mocked(select).mockResolvedValueOnce("intentSource").mockResolvedValueOnce("github").mockResolvedValueOnce("back");
    vi.mocked(input).mockResolvedValueOnce("owner/repo").mockResolvedValueOnce("").mockResolvedValueOnce("$GITHUB_TOKEN");

    await configAction(container);

    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      intentSource: { provider: "github", project: "owner/repo", apiKey: "$GITHUB_TOKEN" },
    }));
  });
});
