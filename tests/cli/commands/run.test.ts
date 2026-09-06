import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerRunCommand } from "../../../src/cli/commands/run.js";
import * as containerModule from "../../../src/infrastructure/container.js";
import { SchedulerRunResult } from "../../../src/scheduler/TaskScheduler.js";

describe("run CLI command", () => {
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  function setupContainerMock(runResult: SchedulerRunResult) {
    const mockScheduler = {
      run: vi.fn().mockResolvedValue(runResult),
    };

    const mockGw = {
      exists: vi.fn((_path: string) => {
        // metadata exists
        return true;
      }),
    };

    const mockConfigService = {
      loadConfig: vi.fn().mockReturnValue({
        environment: "test",
        plannerAgent: "p",
        executorAgent: "e",
        language: "en",
      }),
    };

    const mockContainer = {
      gw: mockGw,
      configService: mockConfigService,
      runnerProvider: vi.fn().mockReturnValue({}),
      processExecutor: {},
      createTaskScheduler: vi.fn().mockReturnValue(mockScheduler),
    };

    vi.spyOn(containerModule, "createAppContainer").mockReturnValue(mockContainer as any);

    return { mockScheduler, mockContainer };
  }

  it("does not set process.exitCode when scheduler completes successfully", async () => {
    setupContainerMock({ status: "completed", specName: "spec-a" });

    const program = new Command();
    registerRunCommand(program);

    await program.parseAsync(["node", "codeforge", "run", "spec-a"]);

    expect(process.exitCode).toBeUndefined();
  });

  it("sets process.exitCode = 1 when scheduler fails", async () => {
    setupContainerMock({
      status: "failed",
      specName: "spec-a",
      reason: "Task failure",
    });

    const program = new Command();
    registerRunCommand(program);

    await program.parseAsync(["node", "codeforge", "run", "spec-a"]);

    expect(process.exitCode).toBe(1);
  });

  it("sets process.exitCode = 1 when scheduler encounters deadlock", async () => {
    setupContainerMock({
      status: "deadlock",
      specName: "spec-a",
    });

    const program = new Command();
    registerRunCommand(program);

    await program.parseAsync(["node", "codeforge", "run", "spec-a"]);

    expect(process.exitCode).toBe(1);
  });
});
