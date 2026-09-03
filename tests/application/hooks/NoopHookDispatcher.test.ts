import { describe, it, expect } from "vitest";
import { NoopHookDispatcher } from "../../../src/infrastructure/hooks/NoopHookDispatcher.js";
import { HOOK_EVENTS } from "../../../src/domain/hook.js";

describe("NoopHookDispatcher", () => {
  it("reports no results for every lifecycle event", async () => {
    const dispatcher = new NoopHookDispatcher();

    for (const event of HOOK_EVENTS) {
      await expect(
        dispatcher.dispatch({ event, specName: "spec" }),
      ).resolves.toEqual([]);
    }
  });

  it("never rejects, so call sites do not have to guard it", async () => {
    const dispatcher = new NoopHookDispatcher();

    await expect(
      dispatcher.dispatch({
        event: "task.failed",
        specName: "spec",
        taskId: "TASK-001",
        errors: ["boom"],
      }),
    ).resolves.toEqual([]);
  });
});
