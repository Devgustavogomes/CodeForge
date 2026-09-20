import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { TaskContext } from "../../src/runners/AgentRunner.js";
import {
  BaseProcessRunner,
  RunnerSpawnOptions,
} from "../../src/runners/BaseProcessRunner.js";
import { NodeProcessExecutor } from "../../src/infrastructure/process/NodeProcessExecutor.js";
import {
  ProcessExecutor,
  ProcessOutput,
  ProcessSpawnOptions,
} from "../../src/infrastructure/process/ProcessExecutor.js";

const spawnMock = vi.fn();

vi.mock("child_process", () => ({
  exec: vi.fn(),
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

class FakeChildProcess extends EventEmitter {
  public stdin = { on: vi.fn(), end: vi.fn() };
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
}

class TestRunner extends BaseProcessRunner {
  private customOptions?: RunnerSpawnOptions;

  setSpawnOptions(options: RunnerSpawnOptions): void {
    this.customOptions = options;
  }

  async execute(context: TaskContext): Promise<void> {
    await this.spawnProcess("test-tool", ["--arg"], context, this.customOptions);
  }
}

function createContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    promptFilePath: "prompts/test.md",
    intentName: "intent-test",
    taskId: "TASK-001",
    ...overrides,
  };
}

describe("BaseProcessRunner - Log Streaming", () => {
  let child: FakeChildProcess;

  beforeEach(() => {
    spawnMock.mockReset();
    child = new FakeChildProcess();
    spawnMock.mockImplementation(() => {
      return child;
    });
  });

  it("passes onStdout and onStderr matching context.onLog to ProcessExecutor", async () => {
    let capturedOptions: ProcessSpawnOptions | undefined;
    const mockExecutor: ProcessExecutor = {
      exec: vi.fn(),
      spawn: vi.fn(async (_cmd, _args, options) => {
        capturedOptions = options;
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };

    const runner = new TestRunner(mockExecutor);
    const onLog = vi.fn();
    const context = createContext({ onLog });

    await runner.execute(context);

    expect(capturedOptions?.onStdout).toBe(onLog);
    expect(capturedOptions?.onStderr).toBe(onLog);
    expect(capturedOptions?.stdio).toBe("pipe");
  });

  it("sets stdio to inherit when silent is not true and onLog is undefined", async () => {
    let capturedOptions: ProcessSpawnOptions | undefined;
    const mockExecutor: ProcessExecutor = {
      exec: vi.fn(),
      spawn: vi.fn(async (_cmd, _args, options) => {
        capturedOptions = options;
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };

    const runner = new TestRunner(mockExecutor);
    const context = createContext({ silent: false, onLog: undefined });

    await runner.execute(context);

    expect(capturedOptions?.stdio).toBe("inherit");
    expect(capturedOptions?.onStdout).toBeUndefined();
    expect(capturedOptions?.onStderr).toBeUndefined();
  });

  it("disables terminal formatting for quiet review processes", async () => {
    let capturedOptions: ProcessSpawnOptions | undefined;
    const mockExecutor: ProcessExecutor = {
      exec: vi.fn(),
      spawn: vi.fn(async (_cmd, _args, options) => {
        capturedOptions = options;
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    await new TestRunner(mockExecutor).execute(createContext({ silent: true, quietTerminal: true }));
    expect(capturedOptions?.stdio).toBe("pipe");
    expect(capturedOptions?.env).toMatchObject({ CI: "1", NO_COLOR: "1", TERM: "dumb" });
  });

  it("sets stdio to pipe when pipePromptToStdin is true and onLog is provided", async () => {
    let capturedOptions: ProcessSpawnOptions | undefined;
    const mockExecutor: ProcessExecutor = {
      exec: vi.fn(),
      spawn: vi.fn(async (_cmd, _args, options) => {
        capturedOptions = options;
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };

    const runner = new TestRunner(mockExecutor);
    runner.setSpawnOptions({ pipePromptToStdin: true });
    const onLog = vi.fn();
    const context = createContext({ onLog });

    await runner.execute(context);

    expect(capturedOptions?.stdio).toEqual(["pipe", "pipe", "pipe"]);
    expect(capturedOptions?.pipePromptFile).toBe(context.promptFilePath);
  });

  it("preserves explicit stdio option when passed in RunnerSpawnOptions", async () => {
    let capturedOptions: ProcessSpawnOptions | undefined;
    const mockExecutor: ProcessExecutor = {
      exec: vi.fn(),
      spawn: vi.fn(async (_cmd, _args, options) => {
        capturedOptions = options;
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };

    const runner = new TestRunner(mockExecutor);
    runner.setSpawnOptions({ stdio: "ignore" });
    const onLog = vi.fn();
    const context = createContext({ onLog });

    await runner.execute(context);

    expect(capturedOptions?.stdio).toBe("ignore");
    expect(capturedOptions?.onStdout).toBe(onLog);
    expect(capturedOptions?.onStderr).toBe(onLog);
  });

  it("streams stdout and stderr chunks in real-time through onLog using NodeProcessExecutor", async () => {
    const receivedLogs: string[] = [];
    const onLog = (chunk: string): void => {
      receivedLogs.push(chunk);
    };

    const runner = new TestRunner();
    const context = createContext({ onLog });

    const executePromise = runner.execute(context);

    // Emit stdout chunks
    child.stdout.emit("data", Buffer.from("Compiling sources...\n"));
    child.stdout.emit("data", "Running tests...\n");

    // Emit stderr chunk
    child.stderr.emit("data", Buffer.from("Warning: deprecation notice\n"));

    // Close process successfully
    child.emit("close", 0);

    await executePromise;

    expect(receivedLogs).toEqual([
      "Compiling sources...\n",
      "Running tests...\n",
      "Warning: deprecation notice\n",
    ]);
  });

  it("works normally when onLog is undefined without throwing any errors", async () => {
    const runner = new TestRunner();
    const context = createContext({ silent: true });

    const executePromise = runner.execute(context);

    child.stdout.emit("data", "Some output");
    child.emit("close", 0);

    await expect(executePromise).resolves.toBeUndefined();
  });

  it("throws error with tail output when process exits non-zero", async () => {
    const runner = new TestRunner();
    const context = createContext({ silent: true });

    const executePromise = runner.execute(context);

    child.stderr.emit("data", "Fatal error occurred\n");
    child.emit("close", 1);

    await expect(executePromise).rejects.toThrow(
      "Test execution failed with exit code 1\n\nOutput Tail:\nFatal error occurred",
    );
  });
});

describe("NodeProcessExecutor - Chunk forwarding & Buffer truncation", () => {
  let child: FakeChildProcess;

  beforeEach(() => {
    spawnMock.mockReset();
    child = new FakeChildProcess();
    spawnMock.mockImplementation(() => {
      return child;
    });
  });

  it("forwards stdout and stderr to callbacks and respects buffer truncation limits", async () => {
    const executor = new NodeProcessExecutor();
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const spawnPromise = executor.spawn("node", ["app.js"], {
      onStdout: (chunk) => stdoutChunks.push(chunk),
      onStderr: (chunk) => stderrChunks.push(chunk),
    });

    const largeChunkA = "A".repeat(4000);
    const largeChunkB = "B".repeat(3000);
    const errChunk = "ERROR\n";

    child.stdout.emit("data", largeChunkA);
    child.stdout.emit("data", largeChunkB);
    child.stderr.emit("data", errChunk);

    child.emit("close", 0);

    const result: ProcessOutput = await spawnPromise;

    // Callbacks received full chunks
    expect(stdoutChunks).toEqual([largeChunkA, largeChunkB]);
    expect(stderrChunks).toEqual([errChunk]);

    // Truncated to MAX_BUFFER_CHARS (5000)
    expect(result.stdout.length).toBe(5000);
    expect(result.stdout.startsWith("A".repeat(2000))).toBe(true);
    expect(result.stdout.endsWith("B".repeat(3000))).toBe(true);
    expect(result.stderr).toBe(errChunk);
    expect(result.exitCode).toBe(0);
  });
});
