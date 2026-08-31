import { spawn } from "child_process";
import * as fs from "fs";
import { AgentRunner, TaskContext } from "./AgentRunner.js";

export class CursorRunner implements AgentRunner {
  async execute(context: TaskContext): Promise<void> {
    return new Promise((resolve, reject) => {
      const promptContent = fs.readFileSync(context.promptFilePath, "utf-8");

      const child = spawn("agent", ["-p", promptContent], {
        stdio: "inherit",
        shell: true,
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Cursor execution failed with exit code ${code}`));
        }
      });

      child.on("error", (error) => {
        reject(error);
      });
    });
  }
}
