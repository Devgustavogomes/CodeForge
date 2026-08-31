import { spawn } from "child_process";
import { AgentRunner, TaskContext } from "./AgentRunner.js";

export class ClaudeRunner implements AgentRunner {
  async execute(context: TaskContext): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("claude", ["-p", context.promptFilePath], {
        stdio: "inherit",
        shell: true,
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Claude execution failed with exit code ${code}`));
        }
      });

      child.on("error", (error) => {
        reject(error);
      });
    });
  }
}
