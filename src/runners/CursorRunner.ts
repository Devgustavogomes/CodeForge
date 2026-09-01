import { spawn, exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
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

  async getAvailableAgents(): Promise<string[]> {
    try {
      const execAsync = promisify(exec);

      const cmd =
        os.platform() === "win32"
          ? "cursor agent models < NUL"
          : "cursor agent models < /dev/null";
      const { stdout } = await execAsync(cmd, { timeout: 5000 });

      const lines = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      return lines;
    } catch (error) {
      return [];
    }
  }
}
