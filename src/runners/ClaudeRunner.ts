import { spawn } from "child_process";
import { AgentRunner, TaskContext } from "./AgentRunner.js";

export class ClaudeRunner implements AgentRunner {
  async execute(context: TaskContext): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ["-p", context.promptFilePath];
      if (context.model) {
        args.unshift("-m", context.model);
      }

      const child = spawn("claude", args, {
        stdio: context.silent ? "pipe" : "inherit",
        shell: false,
      });

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
          reject(
            new Error(`Claude execution failed with exit code ${code}${tail}`),
          );
        }
      });

      child.on("error", (error) => {
        reject(error);
      });
    });
  }

  async getAvailableAgents(): Promise<string[]> {
    return ["fable", "opus", "sonnet", "haiku"];
  }
}
