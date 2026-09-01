import path from "node:path";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
import { AgentRunner, TaskContext } from "./AgentRunner.js";
export class AntigravityRunner implements AgentRunner {
  async execute(context: TaskContext): Promise<void> {
    return new Promise((resolve, reject) => {
      const absolutePromptPath = path.resolve(process.cwd(), context.promptFilePath);
      const args = [
        "-p",
        absolutePromptPath,
        "--dangerously-skip-permissions",
        "--add-dir",
        process.cwd(),
      ];
      if (context.model) {
        args.unshift("--model", context.model);
      }
      
      const child = spawn("agy", args, {
        stdio: context.silent ? "ignore" : "inherit",
        shell: false,
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`Antigravity execution failed with exit code ${code}`),
          );
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
          ? "agy models < NUL"
          : "agy models < /dev/null";
      const { stdout } = await execAsync(cmd, { timeout: 5000 });

      const lines = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const agents = lines
        .map((line) => {
          const match = line.match(/^([a-zA-Z0-9_\-.]+)/);
          return match ? match[1] : null;
        })
        .filter((name): name is string => name !== null);

      const validAgents = agents.filter(
        (name) => !["Usage", "Commands", "Options"].includes(name),
      );
      return Array.from(new Set(validAgents));
    } catch (error) {
      return [];
    }
  }
}
