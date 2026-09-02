import { spawn, SpawnOptions } from "child_process";
import * as fs from "fs";
import { AgentRunner, TaskContext } from "./AgentRunner.js";

export interface RunnerSpawnOptions extends SpawnOptions {
  pipePromptToStdin?: boolean;
}

export abstract class BaseProcessRunner implements AgentRunner {
  abstract execute(context: TaskContext): Promise<void>;

  protected async spawnProcess(
    cmd: string,
    args: string[],
    context: TaskContext,
    options: RunnerSpawnOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let stdio = options.stdio;
      if (!stdio) {
        if (options.pipePromptToStdin) {
          stdio = [
            "pipe",
            context.silent ? "pipe" : "inherit",
            context.silent ? "pipe" : "inherit",
          ];
        } else {
          stdio = context.silent ? "pipe" : "inherit";
        }
      }

      const child = spawn(cmd, args, {
        ...options,
        stdio,
      });

      if (options.pipePromptToStdin && child.stdin) {
        fs.createReadStream(context.promptFilePath).pipe(child.stdin);
      }

      let outputBuffer = "";
      if (context.silent) {
        child.stdout?.on("data", (data) => {
          outputBuffer += data.toString();
          if (outputBuffer.length > 5000) {
            outputBuffer = outputBuffer.slice(-5000);
          }
        });
        child.stderr?.on("data", (data) => {
          outputBuffer += data.toString();
          if (outputBuffer.length > 5000) {
            outputBuffer = outputBuffer.slice(-5000);
          }
        });
      }

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          const tail = outputBuffer.trim()
            ? `\n\nOutput Tail:\n${outputBuffer.trim()}`
            : "";
          const runnerName = this.constructor.name.replace("Runner", "");
          reject(
            new Error(`${runnerName} execution failed with exit code ${code}${tail}`)
          );
        }
      });

      child.on("error", (error) => {
        reject(error);
      });
    });
  }
}
