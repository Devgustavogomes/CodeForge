import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
}));

import { Command } from "commander";
import { select } from "@inquirer/prompts";
import {
  statusAction,
  registerStatusCommand,
  formatPlainTextStatus,
} from "../../../src/cli/commands/status.js";
import * as interactiveModule from "../../../src/cli/interactive.js";
import * as containerModule from "../../../src/infrastructure/container.js";

describe("status CLI command", () => {
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  describe("without --once (TUI mode)", () => {
    it("launches the modern Ink TUI on the 'run' tab with initialSpec set to provided spec", async () => {
      const runInteractiveSpy = vi
        .spyOn(interactiveModule, "runInteractiveMenu")
        .mockResolvedValue(undefined);

      const result = await statusAction("spec-a", {});

      expect(runInteractiveSpy).toHaveBeenCalledTimes(1);
      expect(runInteractiveSpy).toHaveBeenCalledWith({
        initialTab: "run",
        initialSpec: "spec-a",
      });
      expect(result).toEqual({ success: true });
    });

    it("launches the modern Ink TUI on the 'run' tab with initialSpec undefined when no spec is provided", async () => {
      const runInteractiveSpy = vi
        .spyOn(interactiveModule, "runInteractiveMenu")
        .mockResolvedValue(undefined);

      const result = await statusAction(undefined, {});

      expect(runInteractiveSpy).toHaveBeenCalledTimes(1);
      expect(runInteractiveSpy).toHaveBeenCalledWith({
        initialTab: "run",
        initialSpec: undefined,
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe("with --once (plain text summary mode)", () => {
    function setupContainerMock(statusResult: any, specsList: any[] = [{ name: "spec-a", title: "Spec A" }]) {
      const mockUseCase = {
        execute: vi.fn().mockReturnValue(statusResult),
      };

      const mockListSpecsUseCase = {
        execute: vi.fn().mockReturnValue(specsList),
      };

      const mockConfigService = {
        loadConfig: vi.fn().mockReturnValue({
          language: "en",
          environment: "test",
        }),
      };

      const mockContainer = {
        getSpecStatusUseCase: mockUseCase,
        listSpecsUseCase: mockListSpecsUseCase,
        configService: mockConfigService,
      };

      vi.spyOn(containerModule, "createAppContainer").mockReturnValue(mockContainer as any);

      return { mockUseCase, mockContainer };
    }

    it("prints plain text status summary to stdout without entering alternate screen mode", async () => {
      setupContainerMock({
        kind: "status",
        specName: "todo-api",
        specStatus: "running",
        tasks: [
          { id: "TASK-001", title: "Setup", status: "completed", dependencies: [] },
          { id: "TASK-002", title: "Routes", status: "running", dependencies: ["TASK-001"] },
          { id: "TASK-003", title: "Tests", status: "pending", dependencies: ["TASK-002"] },
        ],
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      const stdoutWriteSpy = vi.spyOn(process.stdout, "write");
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await statusAction("todo-api", { once: true });

      // Must not switch to alternate screen buffer
      expect(stdoutWriteSpy).not.toHaveBeenCalledWith(expect.stringContaining("\x1b[?1049h"));

      // Must print status summary via console.log
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("todo-api");
      expect(output).toContain("TASK-001");
      expect(output).toContain("TASK-002");
      expect(output).toContain("TASK-003");
      expect(output).toContain("33%");
      expect(result).toEqual({ success: true });
      expect(process.exitCode).toBeUndefined();
    });

    it("handles spec-not-found error properly", async () => {
      setupContainerMock({
        kind: "spec-not-found",
      });

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await statusAction("unknown-spec", { once: true });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(result).toEqual({ success: false });
    });

    it("handles not-initialized error properly", async () => {
      setupContainerMock({
        kind: "not-initialized",
      });

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await statusAction("spec-a", { once: true });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(result).toEqual({ success: false });
    });

    it("handles no-execution properly", async () => {
      setupContainerMock({
        kind: "no-execution",
        specName: "spec-a",
      });

      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await statusAction("spec-a", { once: true });

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      expect(process.exitCode).toBeUndefined();
    });

    it("prompts user to select spec when spec is omitted with --once", async () => {
      setupContainerMock(
        {
          kind: "status",
          specName: "selected-spec",
          specStatus: "completed",
          tasks: [
            { id: "TASK-001", title: "Task 1", status: "completed", dependencies: [] },
          ],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        [{ name: "selected-spec", title: "Selected Spec" }]
      );

      vi.mocked(select).mockResolvedValueOnce("selected-spec" as any);
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await statusAction(undefined, { once: true });

      expect(select).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("returns { back: true } when user chooses back in spec selection with --once", async () => {
      setupContainerMock(
        { kind: "status", specName: "dummy", specStatus: "completed", tasks: [] },
        [{ name: "spec-a", title: "Spec A" }]
      );

      vi.mocked(select).mockResolvedValueOnce("back" as any);

      const result = await statusAction(undefined, { once: true });

      expect(result).toEqual({ back: true });
    });

    it("returns { success: false } when no specs exist and spec is omitted with --once", async () => {
      setupContainerMock(
        { kind: "status", specName: "dummy", specStatus: "completed", tasks: [] },
        [] // empty specs
      );

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await statusAction(undefined, { once: true });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(result).toEqual({ success: false });
    });
  });

  describe("Commander command registration", () => {
    it("registers status [spec] command with --once option", async () => {
      const runInteractiveSpy = vi
        .spyOn(interactiveModule, "runInteractiveMenu")
        .mockResolvedValue(undefined);

      const program = new Command();
      registerStatusCommand(program);

      await program.parseAsync(["node", "codeforge", "status", "auth-spec"]);

      expect(runInteractiveSpy).toHaveBeenCalledWith({
        initialTab: "run",
        initialSpec: "auth-spec",
      });
    });
  });

  describe("formatPlainTextStatus", () => {
    it("formats status output including task status icons, dependencies, and errors", () => {
      const output = formatPlainTextStatus({
        kind: "status",
        specName: "feature-x",
        specStatus: "failed",
        tasks: [
          { id: "TASK-001", title: "Init", status: "completed", dependencies: [] },
          { id: "TASK-002", title: "Build", status: "failed", dependencies: ["TASK-001"], errors: ["Syntax error at line 10"] },
          { id: "TASK-003", title: "Deploy", status: "pending", dependencies: ["TASK-002"] },
        ],
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      expect(output).toContain("Spec: feature-x (failed)");
      expect(output).toContain("Progress: 1/3 tasks completed (33%)");
      expect(output).toContain("[✓] TASK-001: Init (completed)");
      expect(output).toContain("[✗] TASK-002: Build (failed) [depends on: TASK-001]");
      expect(output).toContain("Error: Syntax error at line 10");
      expect(output).toContain("[○] TASK-003: Deploy (pending) [depends on: TASK-002]");
    });
  });
});
