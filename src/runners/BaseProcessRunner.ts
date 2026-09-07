import { SpawnOptions } from "child_process";
import { AgentRunner, TaskContext } from "./AgentRunner.js";
import { ProcessExecutor, ProcessSpawnOptions } from "../infrastructure/process/ProcessExecutor.js";
import { NodeProcessExecutor } from "../infrastructure/process/NodeProcessExecutor.js";

export interface RunnerSpawnOptions extends SpawnOptions {
  pipePromptToStdin?: boolean;
}

export abstract class BaseProcessRunner implements AgentRunner {
  constructor(
    protected readonly processExecutor: ProcessExecutor = new NodeProcessExecutor(),
  ) {}

  abstract execute(context: TaskContext): Promise<void>;

  protected async spawnProcess(
    cmd: string,
    args: string[],
    context: TaskContext,
    options: RunnerSpawnOptions = {},
  ): Promise<void> {
    let stdio = options.stdio;
    if (!stdio) {
      const captureOutput = Boolean(context.silent || context.onLog);
      if (options.pipePromptToStdin) {
        stdio = [
          "pipe",
          captureOutput ? "pipe" : "inherit",
          captureOutput ? "pipe" : "inherit",
        ];
      } else {
        stdio = captureOutput ? "pipe" : "inherit";
      }
    }

    const spawnOptions: ProcessSpawnOptions = {
      cwd: typeof options.cwd === "string" ? options.cwd : undefined,
      env: options.env as NodeJS.ProcessEnv,
      timeout: options.timeout,
      shell: options.shell,
      stdio,
      pipePromptFile: options.pipePromptToStdin ? context.promptFilePath : undefined,
      onStdout: context.onLog,
      onStderr: context.onLog,
    };

    const result = await this.processExecutor.spawn(cmd, args, spawnOptions);

    if (result.exitCode === 0) {
      return;
    }

    const output = (
      result.stdout + (result.stdout && result.stderr ? "\n" : "") + result.stderr
    ).trim();
    const tail = output ? `\n\nOutput Tail:\n${output.slice(-5000)}` : "";
    const runnerName = this.constructor.name.replace("Runner", "");
    throw new Error(
      `${runnerName} execution failed with exit code ${result.exitCode}${tail}`,
    );
  }
}
