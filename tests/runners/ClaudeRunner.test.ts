import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { TaskContext } from "../../src/runners/AgentRunner.js";

const spawnMock = vi.fn();
const createReadStreamMock = vi.fn();

vi.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock("fs", () => ({
  createReadStream: (...args: unknown[]) => createReadStreamMock(...args),
}));

const { ClaudeRunner } = await import("../../src/runners/ClaudeRunner.js");

class FakeChildProcess extends EventEmitter {
  public stdin = { on: vi.fn() };
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
}

function contextFor(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    promptFilePath: ".codeforge/executions/spec/TASK-001.temp.prompt.md",
    specName: "spec",
    taskId: "TASK-001",
    silent: true,
    ...overrides,
  };
}

function spawnArgs(): string[] {
  return spawnMock.mock.calls[0][1] as string[];
}

describe("ClaudeRunner", () => {
  let child: FakeChildProcess;

  beforeEach(() => {
    spawnMock.mockReset();
    createReadStreamMock.mockReset();

    child = new FakeChildProcess();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    });
    createReadStreamMock.mockReturnValue({ pipe: vi.fn() });
  });

  it("invokes the claude CLI in print mode", async () => {
    await new ClaudeRunner().execute(contextFor());

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0][0]).toBe("claude");
    expect(spawnArgs()).toContain("-p");
  });

  it("selects the model with the long --model flag", async () => {
    await new ClaudeRunner().execute(contextFor({ model: "sonnet" }));

    expect(spawnArgs()).toEqual(["--model", "sonnet", "-p"]);
  });

  it("never passes -m, which the claude CLI does not accept", async () => {
    await new ClaudeRunner().execute(contextFor({ model: "sonnet" }));

    expect(spawnArgs()).not.toContain("-m");
  });

  it("omits the model flag when no model is configured", async () => {
    await new ClaudeRunner().execute(contextFor());

    expect(spawnArgs()).toEqual(["-p"]);
  });

  it("streams the prompt file over stdin instead of passing its path as the prompt", async () => {
    const context = contextFor();

    await new ClaudeRunner().execute(context);

    expect(createReadStreamMock).toHaveBeenCalledWith(context.promptFilePath);
    expect(spawnArgs()).not.toContain(context.promptFilePath);
  });

  it("rejects when the claude process exits non-zero", async () => {
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => child.emit("close", 1));
      return child;
    });

    await expect(new ClaudeRunner().execute(contextFor())).rejects.toThrow();
  });

  it("advertises the models the claude CLI supports", async () => {
    await expect(new ClaudeRunner().getAvailableAgents()).resolves.toEqual([
      "fable",
      "opus",
      "sonnet",
      "haiku",
    ]);
  });
});
