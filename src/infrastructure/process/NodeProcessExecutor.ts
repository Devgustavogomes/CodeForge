import { exec, spawn, ChildProcess, StdioOptions } from "child_process";
import * as fs from "fs";
import {
  ProcessExecOptions,
  ProcessExecutor,
  ProcessOutput,
  ProcessSpawnOptions,
} from "./ProcessExecutor.js";

const MAX_BUFFER_CHARS = 5_000;

export class NodeProcessExecutor implements ProcessExecutor {
  exec(command: string, options?: ProcessExecOptions): Promise<ProcessOutput> {
    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: options?.cwd,
          env: options?.env,
          timeout: options?.timeout,
          shell: typeof options?.shell === "string" ? options.shell : undefined,
        },
        (error, stdout, stderr) => {
          let exitCode: number | null = 0;
          if (error) {
            exitCode = typeof error.code === "number" ? error.code : (error.killed ? null : 1);
          }
          resolve({
            stdout: stdout ? stdout.toString() : "",
            stderr: stderr ? stderr.toString() : (error ? error.message : ""),
            exitCode,
          });
        },
      );
    });
  }

  spawn(
    command: string,
    args: string[] = [],
    options?: ProcessSpawnOptions,
  ): Promise<ProcessOutput> {
    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(command, args, {
          cwd: options?.cwd,
          env: options?.env,
          stdio: options?.stdio as StdioOptions,
          shell: options?.shell,
        });
      } catch (err) {
        return reject(err);
      }

      let stdoutBuffer = "";
      let stderrBuffer = "";
      let settled = false;

      let timer: NodeJS.Timeout | undefined;
      if (options?.timeout && options.timeout > 0) {
        timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            try {
              if (typeof child.kill === "function") {
                child.kill();
              }
            } catch {
              // Ignore process kill errors
            }
            const timeoutMsg = `Process timed out after ${options.timeout}ms`;
            stderrBuffer = stderrBuffer ? `${stderrBuffer}\n${timeoutMsg}` : timeoutMsg;
            resolve({
              stdout: stdoutBuffer,
              stderr: stderrBuffer,
              exitCode: null,
            });
          }
        }, options.timeout);
      }

      if (options?.pipePromptFile && child.stdin) {
        const stream = fs.createReadStream(options.pipePromptFile);
        stream.pipe(child.stdin);
      }

      if (options?.pipeStdinContent !== undefined && child.stdin) {
        child.stdin.on("error", () => {
          // Ignore EPIPE errors if the child process exits before reading stdin
        });
        child.stdin.end(options.pipeStdinContent);
      }

      child.stdout?.on("data", (data: Buffer | string) => {
        stdoutBuffer += data.toString();
        if (stdoutBuffer.length > MAX_BUFFER_CHARS) {
          stdoutBuffer = stdoutBuffer.slice(-MAX_BUFFER_CHARS);
        }
      });

      child.stderr?.on("data", (data: Buffer | string) => {
        stderrBuffer += data.toString();
        if (stderrBuffer.length > MAX_BUFFER_CHARS) {
          stderrBuffer = stderrBuffer.slice(-MAX_BUFFER_CHARS);
        }
      });

      child.on("error", (error: Error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({
          stdout: stdoutBuffer,
          stderr: stderrBuffer ? `${stderrBuffer}\n${error.message}` : error.message,
          exitCode: null,
        });
      });

      child.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          exitCode: code,
        });
      });
    });
  }
}
