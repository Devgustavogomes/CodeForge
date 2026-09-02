import { spawn } from "child_process";
import * as fs from "fs";
import { AgentRunner, TaskContext } from "./AgentRunner.js";

export class CodexRunner implements AgentRunner {
  async execute(context: TaskContext): Promise<void> {
    return new Promise((resolve, reject) => {
      const promptContent = fs.readFileSync(context.promptFilePath, "utf-8");

      const child = spawn("codex", [promptContent], {
        stdio: context.silent ? "pipe" : "inherit",
        shell: true,
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
          const tail = outputBuffer.trim() ? `\n\nOutput Tail:\n${outputBuffer.trim()}` : '';
          reject(new Error(`Codex execution failed with exit code ${code}${tail}`));
        }
      });

      child.on("error", (error) => {
        reject(error);
      });
    });
  }

  async getAvailableAgents(): Promise<string[]> {
    return ["codex-default"];
  }
}
