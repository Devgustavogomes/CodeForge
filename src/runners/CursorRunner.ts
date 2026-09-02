import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
import { TaskContext } from "./AgentRunner.js";
import { BaseProcessRunner } from "./BaseProcessRunner.js";

export class CursorRunner extends BaseProcessRunner {
  async execute(context: TaskContext): Promise<void> {
    const args: string[] = [];

    args.push("-p", "-");

    if (context.model) {
      args.push("--model", context.model);
    }

    return this.spawnProcess("agent", args, context, {
      shell: process.platform === "win32",
      cwd: process.cwd(),
      pipePromptToStdin: true,
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
    } catch {
      return [];
    }
  }
}
