import { describe, expect, it } from "vitest";
import { SchedulerReporter } from "../../../src/application/ports/SchedulerReporter.js";

describe("SchedulerReporter", () => {
  it("does not require reporters to implement AI review callbacks", () => {
    const reporter: SchedulerReporter = {
      onStart: () => undefined,
      onUpdate: () => undefined,
      onComplete: () => undefined,
      onFail: () => undefined,
      onDeadlock: () => undefined,
      onError: () => undefined,
    };

    expect(reporter.onReviewStart).toBeUndefined();
    expect(reporter.onReviewEnd).toBeUndefined();
    expect(reporter.onReviewError).toBeUndefined();
  });
});
