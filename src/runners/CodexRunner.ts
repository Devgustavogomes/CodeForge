import { spawn } from "child_process";
import * as fs from "fs";
import { AgentRunner, TaskContext } from "./AgentRunner.js";

export class CodexRunner implements AgentRunner {
  async execute(context: TaskContext): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        "--ask-for-approval",
        "never",
        "exec",
        "--sandbox",
        "workspace-write",
      ];

      if (context.model) {
        args.push("--model", context.model);
      }

      args.push("-");

      const child = spawn("codex", args, {
        stdio: [
          "pipe",
          context.silent ? "pipe" : "inherit",
          context.silent ? "pipe" : "inherit",
        ],
        shell: process.platform === "win32",
        cwd: process.cwd(),
      });

      fs.createReadStream(context.promptFilePath).pipe(child.stdin!);

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
            new Error(`Codex execution failed with exit code ${code}${tail}`),
          );
        }
      });

      child.on("error", reject);
    });
  }

  async getAvailableAgents(): Promise<string[]> {
    return [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.2",
      "gpt-5.1",
      "gpt-5",
      "gpt-4.1",
      "gpt-4.1-mini",
    ];
  }
}
