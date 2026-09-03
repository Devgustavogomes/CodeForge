import { describe, it, expect } from "vitest";
import { CommandHookDispatcher } from "../../../src/infrastructure/hooks/CommandHookDispatcher.js";
import { HookContext, HookMap } from "../../../src/domain/hook.js";

const notOnWindows = process.platform !== "win32";

function contextFor(overrides: Partial<HookContext> = {}): HookContext {
  return { event: "task.verify", specName: "spec", taskId: "TASK-001", ...overrides };
}

function dispatcherFor(hooks: HookMap): CommandHookDispatcher {
  return new CommandHookDispatcher(hooks, process.cwd());
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

  it.runIf(notOnWindows)("passes the context as JSON on stdin", async () => {
    const dispatcher = dispatcherFor({ "task.verify": [{ name: "reader", run: "cat" }] });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(JSON.parse(result.output)).toEqual({
      event: "task.verify",
      specName: "spec",
      taskId: "TASK-001",
    });
  });

  it.runIf(notOnWindows)("exposes the context as CODEFORGE_* environment variables", async () => {
    const dispatcher = dispatcherFor({
      "task.verify": [
        { name: "env", run: 'printf "%s|%s|%s" "$CODEFORGE_EVENT" "$CODEFORGE_SPEC" "$CODEFORGE_TASK_ID"' },
      ],
    });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(result.output).toBe("task.verify|spec|TASK-001");
  });

  it.runIf(notOnWindows)("leaves CODEFORGE_TASK_ID empty for run-level events", async () => {
    const dispatcher = dispatcherFor({
      "run.started": [{ name: "env", run: 'printf "[%s]" "$CODEFORGE_TASK_ID"' }],
    });

    const [result] = await dispatcher.dispatch(
      contextFor({ event: "run.started", taskId: undefined }),
    );

    expect(result.output).toBe("[]");
  });

  it.runIf(notOnWindows)("fails a hook that outruns its timeout", async () => {
    const dispatcher = dispatcherFor({
      "task.verify": [{ name: "slow", run: "sleep 5", timeout: 100 }],
    });

    const [result] = await dispatcher.dispatch(contextFor());

    expect(result.ok).toBe(false);
    expect(result.output).toContain("timed out after 100ms");
  });

  it.runIf(notOnWindows)("runs the hooks of one event in declaration order", async () => {
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
});
