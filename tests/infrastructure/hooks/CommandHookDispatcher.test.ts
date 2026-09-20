import { describe, it, expect, vi } from "vitest";
import { CommandHookDispatcher } from "../../../src/infrastructure/hooks/CommandHookDispatcher.js";
import { HookContext, HookMap } from "../../../src/domain/hook.js";
import { HookReporter } from "../../../src/application/ports/HookReporter.js";
import { FakeProcessExecutor, ProcessSpawnOptions } from "../../helpers/fake-process-executor.js";

function contextFor(overrides: Partial<HookContext> = {}): HookContext {
  return { event: "task.verify", intentName: "intent", taskId: "TASK-001", ...overrides };
}

function createDefaultExecutor(): FakeProcessExecutor {
  const executor = new FakeProcessExecutor();
  executor.setDefaultHandler((cmd, _args, options) => {
    if (cmd.startsWith("exit ")) {
      const code = parseInt(cmd.slice(5).trim(), 10);
      return { stdout: "", stderr: "", exitCode: Number.isNaN(code) ? 0 : code };
    }
    if (cmd.includes("echo on-stdout")) {
      return { stdout: "on-stdout\n", stderr: "on-stderr\n", exitCode: 1 };
    }
    if (cmd === "cat") {
      const spawnOpts = options as ProcessSpawnOptions | undefined;
      return { stdout: spawnOpts?.pipeStdinContent ?? "", stderr: "", exitCode: 0 };
    }
    if (cmd.includes("$CODEFORGE_EVENT")) {
      const env = options?.env ?? {};
      return {
        stdout: `${env.CODEFORGE_EVENT}|${env.CODEFORGE_INTENT}|${env.CODEFORGE_TASK_ID}`,
        stderr: "",
        exitCode: 0,
      };
    }
    if (cmd.includes("[%s]")) {
      const env = options?.env ?? {};
      return {
        stdout: `[${env.CODEFORGE_TASK_ID ?? ""}]`,
        stderr: "",
        exitCode: 0,
      };
    }
    if (cmd.startsWith("sleep")) {
      return {
        stdout: "",
        stderr: `Hook timed out after ${options?.timeout ?? 100}ms.`,
        exitCode: null,
      };
    }
    if (cmd.startsWith("echo ")) {
      return { stdout: cmd.slice(5).trim(), stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  });
  return executor;
}

function dispatcherFor(
  hooks: HookMap,
  executor: FakeProcessExecutor = createDefaultExecutor(),
  reporter?: HookReporter,
): CommandHookDispatcher {
  return new CommandHookDispatcher(hooks, process.cwd(), executor, reporter);
}

describe("CommandHookDispatcher", () => {
  it("reports nothing when the event has no hooks configured", async () => {
    const dispatcher = dispatcherFor({ "run.completed": [{ name: "other", run: "exit 0" }] });

    await expect(dispatcher.dispatch(contextFor())).resolves.toEqual([]);
  });

  it("treats a zero exit as a pass", async () => {
    const dispatcher = dispatcherFor({ "task.verify": [{ name: "green", run: "exit 0" }] });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.name).toBe("green");
  });

  it("treats a non-zero exit as a failure and keeps the exit code", async () => {
    const dispatcher = dispatcherFor({ "task.verify": [{ name: "red", run: "exit 3" }] });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
  });

  it("defaults an unspecified hook to notify, so it cannot veto by accident", async () => {
    const dispatcher = dispatcherFor({ "task.verify": [{ name: "plain", run: "exit 1" }] });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(result.type).toBe("notify");
  });

  it("keeps the declared type", async () => {
    const dispatcher = dispatcherFor({
      "task.verify": [{ name: "gate", run: "exit 0", type: "gate" }],
    });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(result.type).toBe("gate");
  });

  it("captures both stdout and stderr", async () => {
    const dispatcher = dispatcherFor({
      "task.verify": [{ name: "chatty", run: "echo on-stdout; echo on-stderr 1>&2; exit 1" }],
    });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(result.output).toContain("on-stdout");
    expect(result.output).toContain("on-stderr");
  });

  it("passes the context as JSON on stdin", async () => {
    const dispatcher = dispatcherFor({ "task.verify": [{ name: "reader", run: "cat" }] });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(JSON.parse(result.output)).toEqual({
      event: "task.verify",
      intentName: "intent",
      taskId: "TASK-001",
    });
  });

  it("exposes the context as CODEFORGE_* environment variables", async () => {
    const dispatcher = dispatcherFor({
      "task.verify": [
        { name: "env", run: 'printf "%s|%s|%s" "$CODEFORGE_EVENT" "$CODEFORGE_INTENT" "$CODEFORGE_TASK_ID"' },
      ],
    });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(result.output).toBe("task.verify|intent|TASK-001");
  });

  it("leaves CODEFORGE_TASK_ID empty for run-level events", async () => {
    const dispatcher = dispatcherFor({
      "run.started": [{ name: "env", run: 'printf "[%s]" "$CODEFORGE_TASK_ID"' }],
    });

    const [result] = await dispatcher.dispatch(
      contextFor({ event: "run.started", taskId: undefined }),
    );

    expect(result.output).toBe("[]");
  });

  it("fails a hook that outruns its timeout", async () => {
    const dispatcher = dispatcherFor({
      "task.verify": [{ name: "slow", run: "sleep 5", timeout: 100 }],
    });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(result.ok).toBe(false);
    expect(result.output).toContain("timed out after 100ms");
  });

  it("runs the hooks of one event in declaration order", async () => {
    const dispatcher = dispatcherFor({
      "task.verify": [
        { name: "first", run: "echo 1" },
        { name: "second", run: "echo 2" },
        { name: "third", run: "echo 3" },
      ],
    });

    const results = await dispatcher.dispatch(contextFor());

    expect(results.map((r) => r.name)).toEqual(["first", "second", "third"]);
    expect(results.map((r) => r.output)).toEqual(["1", "2", "3"]);
  });

  describe("HookReporter", () => {
    it("notifies onHookStart and onHookEnd in order with accurate data for successful hook", async () => {
      const reporter: HookReporter = {
        onHookStart: vi.fn(),
        onHookEnd: vi.fn(),
      };
      const dispatcher = dispatcherFor(
        { "task.verify": [{ name: "green", run: "exit 0" }] },
        createDefaultExecutor(),
        reporter,
      );

      const [result] = await dispatcher.dispatch(contextFor());

      expect(result.ok).toBe(true);
      expect(reporter.onHookStart).toHaveBeenCalledTimes(1);
      expect(reporter.onHookEnd).toHaveBeenCalledTimes(1);

      expect(reporter.onHookStart).toHaveBeenCalledWith({
        event: "task.verify",
        definition: { name: "green", run: "exit 0" },
        context: contextFor(),
        startedAt: expect.any(Number),
      });

      expect(reporter.onHookEnd).toHaveBeenCalledWith({
        event: "task.verify",
        definition: { name: "green", run: "exit 0" },
        context: contextFor(),
        result: {
          name: "green",
          type: "notify",
          ok: true,
          exitCode: 0,
          output: "",
        },
        durationMs: expect.any(Number),
      });

      const startOrder = vi.mocked(reporter.onHookStart).mock.invocationCallOrder[0];
      const endOrder = vi.mocked(reporter.onHookEnd).mock.invocationCallOrder[0];
      expect(startOrder).toBeLessThan(endOrder);

      const endCall = vi.mocked(reporter.onHookEnd).mock.calls[0][0];
      expect(endCall.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("notifies onHookStart and onHookEnd for failed hook with exit code", async () => {
      const reporter: HookReporter = {
        onHookStart: vi.fn(),
        onHookEnd: vi.fn(),
      };
      const dispatcher = dispatcherFor(
        { "task.verify": [{ name: "red", run: "exit 3" }] },
        createDefaultExecutor(),
        reporter,
      );

      const [result] = await dispatcher.dispatch(contextFor());

      expect(result.ok).toBe(false);
      expect(reporter.onHookStart).toHaveBeenCalledTimes(1);
      expect(reporter.onHookEnd).toHaveBeenCalledTimes(1);
      expect(reporter.onHookEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.objectContaining({
            name: "red",
            ok: false,
            exitCode: 3,
          }),
        }),
      );
    });

    it("notifies onHookEnd when process spawn throws an error", async () => {
      const reporter: HookReporter = {
        onHookStart: vi.fn(),
        onHookEnd: vi.fn(),
      };
      const executor = new FakeProcessExecutor();
      executor.spawn = vi.fn().mockRejectedValue(new Error("binary not found"));

      const dispatcher = dispatcherFor(
        { "task.verify": [{ name: "failing", run: "notfound" }] },
        executor,
        reporter,
      );

      const [result] = await dispatcher.dispatch(contextFor());

      expect(result.ok).toBe(false);
      expect(result.exitCode).toBeNull();
      expect(result.output).toContain("binary not found");

      expect(reporter.onHookStart).toHaveBeenCalledTimes(1);
      expect(reporter.onHookEnd).toHaveBeenCalledTimes(1);
      expect(reporter.onHookEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.objectContaining({
            name: "failing",
            ok: false,
            exitCode: null,
            output: expect.stringContaining("binary not found"),
          }),
          durationMs: expect.any(Number),
        }),
      );
    });

    it("allows dynamically attaching a reporter via setReporter", async () => {
      const reporter: HookReporter = {
        onHookStart: vi.fn(),
        onHookEnd: vi.fn(),
      };
      const dispatcher = dispatcherFor({
        "task.verify": [{ name: "green", run: "exit 0" }],
      });

      expect(dispatcher.getReporter()).toBeUndefined();
      dispatcher.setReporter(reporter);
      expect(dispatcher.getReporter()).toBe(reporter);

      await dispatcher.dispatch(contextFor());

      expect(reporter.onHookStart).toHaveBeenCalledTimes(1);
      expect(reporter.onHookEnd).toHaveBeenCalledTimes(1);
    });

    it("isolates errors when reporter.onHookStart throws", async () => {
      const reporter: HookReporter = {
        onHookStart: vi.fn().mockImplementation(() => {
          throw new Error("error in onHookStart");
        }),
        onHookEnd: vi.fn(),
      };
      const dispatcher = dispatcherFor(
        { "task.verify": [{ name: "green", run: "exit 0" }] },
        createDefaultExecutor(),
        reporter,
      );

      await expect(dispatcher.dispatch(contextFor())).resolves.toBeDefined();
      expect(reporter.onHookStart).toHaveBeenCalledTimes(1);
      expect(reporter.onHookEnd).toHaveBeenCalledTimes(1);
    });

    it("isolates errors when reporter.onHookEnd throws", async () => {
      const reporter: HookReporter = {
        onHookStart: vi.fn(),
        onHookEnd: vi.fn().mockImplementation(() => {
          throw new Error("error in onHookEnd");
        }),
      };
      const dispatcher = dispatcherFor(
        { "task.verify": [{ name: "green", run: "exit 0" }] },
        createDefaultExecutor(),
        reporter,
      );

      const [result] = await dispatcher.dispatch(contextFor());

      expect(result.ok).toBe(true);
      expect(reporter.onHookStart).toHaveBeenCalledTimes(1);
      expect(reporter.onHookEnd).toHaveBeenCalledTimes(1);
    });

    it("notifies hooks in sequence across multiple configured hooks", async () => {
      const calls: string[] = [];
      const reporter: HookReporter = {
        onHookStart: vi.fn((info) => calls.push(`start:${info.definition.name}`)),
        onHookEnd: vi.fn((info) => calls.push(`end:${info.definition.name}`)),
      };
      const dispatcher = dispatcherFor(
        {
          "task.verify": [
            { name: "first", run: "echo 1" },
            { name: "second", run: "echo 2" },
          ],
        },
        createDefaultExecutor(),
        reporter,
      );

      await dispatcher.dispatch(contextFor());

      expect(calls).toEqual([
        "start:first",
        "end:first",
        "start:second",
        "end:second",
      ]);
    });
  });
});
