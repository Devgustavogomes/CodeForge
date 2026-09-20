import { describe, expect, it, vi } from "vitest";
import { CliHookReporter } from "../../../src/cli/ui/CliHookReporter.js";
import { translate } from "../../../src/cli/ui/i18n.js";
import { TerminalSchedulerReporter } from "../../../src/cli/ui/TerminalSchedulerReporter.js";

function createMockStream(isTTY = false) {
  let output = "";
  return {
    isTTY,
    write: vi.fn((chunk: string) => {
      output += chunk;
      return true;
    }),
    getOutput: () => output,
    clear: () => {
      output = "";
    },
  };
}

describe("CliHookReporter", () => {
  describe("i18n translation keys", () => {
    const requiredKeys = [
      "cli_hook_starting",
      "cli_hook_success",
      "cli_hook_failed",
      "tui_hooks_box_title",
      "tui_hooks_active_title",
      "tui_hooks_command_label",
      "tui_hooks_elapsed_label",
      "tui_hooks_idle",
      "tui_hooks_none_configured",
      "tui_hooks_recent_title",
      "tui_hooks_badge_gate",
      "tui_hooks_badge_notify",
    ] as const;

    it.each(["en", "pt", "es"] as const)(
      "defines all 12 hook visibility keys in %s dictionary",
      (lang) => {
        for (const key of requiredKeys) {
          const translated = translate(key, lang);
          expect(translated).toBeDefined();
          expect(translated.length).toBeGreaterThan(0);
          expect(translated).not.toEqual(key);
        }
      },
    );
  });

  describe("localized notification formatting", () => {
    it("formats start, success, and failure notifications in English", () => {
      const stream = createMockStream(false);
      const reporter = new CliHookReporter({
        stream: stream as any,
        language: "en",
        color: false,
      });

      reporter.onHookStart({
        event: "task.verify",
        definition: { name: "lint", run: "npm run lint", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent", taskId: "T1" },
        startedAt: 1000,
      });

      expect(stream.getOutput()).toContain(
        "▶ [hook] Executing 'lint' (task.verify): npm run lint\n",
      );

      stream.clear();

      reporter.onHookEnd({
        event: "task.verify",
        definition: { name: "lint", run: "npm run lint", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent", taskId: "T1" },
        result: {
          name: "lint",
          type: "gate",
          ok: true,
          exitCode: 0,
          output: "Clean code",
        },
        durationMs: 345,
      });

      expect(stream.getOutput()).toContain(
        "✔ [hook] Hook 'lint' (task.verify) completed successfully (345ms)\n",
      );

      stream.clear();

      reporter.onHookEnd({
        event: "task.verify",
        definition: { name: "lint", run: "npm run lint", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent", taskId: "T1" },
        result: {
          name: "lint",
          type: "gate",
          ok: false,
          exitCode: 2,
          output: "Syntax error on line 42",
        },
        durationMs: 120,
      });

      expect(stream.getOutput()).toContain(
        "✖ [hook] Hook 'lint' (task.verify) failed with exit code 2\n",
      );
    });

    it("formats start, success, and failure notifications in Portuguese", () => {
      const stream = createMockStream(false);
      const reporter = new CliHookReporter({
        stream: stream as any,
        language: "pt",
        color: false,
      });

      reporter.onHookStart({
        event: "task.started",
        definition: { name: "slack-notify", run: "curl -X POST ...", type: "notify" },
        context: { event: "task.started", intentName: "test-intent" },
        startedAt: 1000,
      });

      expect(stream.getOutput()).toContain(
        "▶ [hook] Executando 'slack-notify' (task.started): curl -X POST ...\n",
      );

      stream.clear();

      reporter.onHookEnd({
        event: "task.started",
        definition: { name: "slack-notify", run: "curl -X POST ...", type: "notify" },
        context: { event: "task.started", intentName: "test-intent" },
        result: {
          name: "slack-notify",
          type: "notify",
          ok: true,
          exitCode: 0,
          output: "",
        },
        durationMs: 500,
      });

      expect(stream.getOutput()).toContain(
        "✔ [hook] Hook 'slack-notify' (task.started) concluído com sucesso (500ms)\n",
      );

      stream.clear();

      reporter.onHookEnd({
        event: "task.started",
        definition: { name: "slack-notify", run: "curl -X POST ...", type: "notify" },
        context: { event: "task.started", intentName: "test-intent" },
        result: {
          name: "slack-notify",
          type: "notify",
          ok: false,
          exitCode: 1,
          output: "Failed to connect",
        },
        durationMs: 120,
      });

      expect(stream.getOutput()).toContain(
        "✖ [hook] Hook 'slack-notify' (task.started) falhou com código de saída 1\n",
      );
    });

    it("formats start, success, and failure notifications in Spanish", () => {
      const stream = createMockStream(false);
      const reporter = new CliHookReporter({
        stream: stream as any,
        language: "es",
        color: false,
      });

      reporter.onHookStart({
        event: "run.completed",
        definition: { name: "metrics", run: "node report.js", type: "notify" },
        context: { event: "run.completed", intentName: "test-intent" },
        startedAt: 1000,
      });

      expect(stream.getOutput()).toContain(
        "▶ [hook] Ejecutando 'metrics' (run.completed): node report.js\n",
      );

      stream.clear();

      reporter.onHookEnd({
        event: "run.completed",
        definition: { name: "metrics", run: "node report.js", type: "notify" },
        context: { event: "run.completed", intentName: "test-intent" },
        result: {
          name: "metrics",
          type: "notify",
          ok: true,
          exitCode: 0,
          output: "",
        },
        durationMs: 80,
      });

      expect(stream.getOutput()).toContain(
        "✔ [hook] Hook 'metrics' (run.completed) completado con éxito (80ms)\n",
      );

      stream.clear();

      reporter.onHookEnd({
        event: "run.completed",
        definition: { name: "metrics", run: "node report.js", type: "notify" },
        context: { event: "run.completed", intentName: "test-intent" },
        result: {
          name: "metrics",
          type: "notify",
          ok: false,
          exitCode: 127,
          output: "command not found: node",
        },
        durationMs: 30,
      });

      expect(stream.getOutput()).toContain(
        "✖ [hook] Hook 'metrics' (run.completed) falló con código de salida 127\n",
      );
    });
  });

  describe("color support", () => {
    it("uses ANSI cyan for start, green for success, and red for failure when color is enabled", () => {
      const stream = createMockStream(true);
      const reporter = new CliHookReporter({
        stream: stream as any,
        language: "en",
        color: true,
      });

      reporter.onHookStart({
        event: "task.verify",
        definition: { name: "test", run: "npm test", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent" },
        startedAt: 1000,
      });

      expect(stream.getOutput()).toContain(
        "\x1b[36m▶ [hook] Executing 'test' (task.verify): npm test\x1b[0m\n",
      );

      stream.clear();

      reporter.onHookEnd({
        event: "task.verify",
        definition: { name: "test", run: "npm test", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent" },
        result: {
          name: "test",
          type: "gate",
          ok: true,
          exitCode: 0,
          output: "",
        },
        durationMs: 250,
      });

      expect(stream.getOutput()).toContain(
        "\x1b[32m✔ [hook] Hook 'test' (task.verify) completed successfully (250ms)\x1b[0m\n",
      );

      stream.clear();

      reporter.onHookEnd({
        event: "task.verify",
        definition: { name: "test", run: "npm test", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent" },
        result: {
          name: "test",
          type: "gate",
          ok: false,
          exitCode: 1,
          output: "Fail",
        },
        durationMs: 250,
      });

      expect(stream.getOutput()).toContain(
        "\x1b[31m✖ [hook] Hook 'test' (task.verify) failed with exit code 1\x1b[0m\n",
      );
    });

    it("does not include ANSI escape sequences when color is disabled", () => {
      const stream = createMockStream(false);
      const reporter = new CliHookReporter({
        stream: stream as any,
        color: false,
      });

      reporter.onHookStart({
        event: "task.verify",
        definition: { name: "lint", run: "eslint .", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent" },
        startedAt: 1000,
      });

      expect(stream.getOutput()).not.toContain("\x1b[");
      expect(stream.getOutput()).toContain("▶ [hook] Executing 'lint' (task.verify): eslint .");
    });
  });

  describe("failure output snippet and truncation", () => {
    it("does not append snippet lines when output is empty or whitespace only", () => {
      const stream = createMockStream(false);
      const reporter = new CliHookReporter({
        stream: stream as any,
        color: false,
      });

      reporter.onHookEnd({
        event: "task.verify",
        definition: { name: "lint", run: "npm run lint", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent" },
        result: {
          name: "lint",
          type: "gate",
          ok: false,
          exitCode: 1,
          output: "   \n\n  ",
        },
        durationMs: 100,
      });

      const lines = stream.getOutput().trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe("✖ [hook] Hook 'lint' (task.verify) failed with exit code 1");
    });

    it("indents 1 or 2 lines with 4 spaces", () => {
      const stream = createMockStream(false);
      const reporter = new CliHookReporter({
        stream: stream as any,
        color: false,
      });

      reporter.onHookEnd({
        event: "task.verify",
        definition: { name: "typecheck", run: "tsc", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent" },
        result: {
          name: "typecheck",
          type: "gate",
          ok: false,
          exitCode: 2,
          output: "TS2322: Type 'string' is not assignable to 'number'.\n  at file.ts:10",
        },
        durationMs: 200,
      });

      const output = stream.getOutput();
      expect(output).toContain("    TS2322: Type 'string' is not assignable to 'number'.");
      expect(output).toContain("      at file.ts:10");
    });

    it("limits output snippet to at most 3 indented lines when output is long", () => {
      const stream = createMockStream(false);
      const reporter = new CliHookReporter({
        stream: stream as any,
        color: false,
      });

      const longOutput = [
        "Line 1: Error occurred",
        "Line 2: Stack frame 1",
        "Line 3: Stack frame 2",
        "Line 4: Stack frame 3",
        "Line 5: Stack frame 4",
        "Line 6: Stack frame 5",
      ].join("\n");

      reporter.onHookEnd({
        event: "task.verify",
        definition: { name: "unit-tests", run: "vitest", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent" },
        result: {
          name: "unit-tests",
          type: "gate",
          ok: false,
          exitCode: 1,
          output: longOutput,
        },
        durationMs: 450,
      });

      const lines = stream.getOutput().trim().split("\n");
      // 1 line for header + 3 lines for snippet
      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe("✖ [hook] Hook 'unit-tests' (task.verify) failed with exit code 1");
      expect(lines[1]).toBe("    Line 1: Error occurred");
      expect(lines[2]).toBe("    Line 2: Stack frame 1");
      expect(lines[3]).toBe("    Line 3: Stack frame 2");
      expect(stream.getOutput()).not.toContain("Line 4");
      expect(stream.getOutput()).not.toContain("Line 5");
    });

    it("defaults exitCode to 1 when exitCode is null or undefined", () => {
      const stream = createMockStream(false);
      const reporter = new CliHookReporter({
        stream: stream as any,
        color: false,
      });

      reporter.onHookEnd({
        event: "task.verify",
        definition: { name: "timeout-hook", run: "sleep 100", type: "gate" },
        context: { event: "task.verify", intentName: "test-intent" },
        result: {
          name: "timeout-hook",
          type: "gate",
          ok: false,
          exitCode: null,
          output: "Execution timed out",
        },
        durationMs: 3000,
      });

      expect(stream.getOutput()).toContain(
        "✖ [hook] Hook 'timeout-hook' (task.verify) failed with exit code 1",
      );
    });
  });

  describe("coordination with TerminalSchedulerReporter and printLine", () => {
    it("routes messages to terminalReporter.printLine when provided", () => {
      const mockTerminalReporter = {
        printLine: vi.fn(),
      } as unknown as TerminalSchedulerReporter;

      const reporter = new CliHookReporter({
        terminalReporter: mockTerminalReporter,
        color: false,
      });

      reporter.onHookStart({
        event: "task.started",
        definition: { name: "echo", run: "echo 1", type: "notify" },
        context: { event: "task.started", intentName: "test-intent" },
        startedAt: 1000,
      });

      expect(mockTerminalReporter.printLine).toHaveBeenCalledWith(
        "▶ [hook] Executing 'echo' (task.started): echo 1",
      );
    });

    it("routes messages to custom printLine callback when provided", () => {
      const customPrintLine = vi.fn();
      const reporter = new CliHookReporter({
        printLine: customPrintLine,
        color: false,
      });

      reporter.onHookStart({
        event: "task.started",
        definition: { name: "echo", run: "echo 1", type: "notify" },
        context: { event: "task.started", intentName: "test-intent" },
        startedAt: 1000,
      });

      expect(customPrintLine).toHaveBeenCalledWith(
        "▶ [hook] Executing 'echo' (task.started): echo 1",
      );
    });
  });
});
