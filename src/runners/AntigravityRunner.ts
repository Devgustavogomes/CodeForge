import path from "node:path";
import * as os from "os";
import { TaskContext } from "./AgentRunner.js";
import { BaseProcessRunner } from "./BaseProcessRunner.js";
import { ProcessExecutor } from "../infrastructure/process/ProcessExecutor.js";

export class AntigravityRunner extends BaseProcessRunner {
  constructor(processExecutor?: ProcessExecutor) {
    super(processExecutor);
  }

  async execute(context: TaskContext): Promise<void> {
    const absolutePromptPath = path.resolve(
      process.cwd(),
      context.promptFilePath,
    );
    const args = [
      "-p",
      absolutePromptPath,
      "--print-timeout",
      "2h",
      "--dangerously-skip-permissions",
      "--add-dir",
      process.cwd(),
    ];
    if (context.model) {
      args.unshift("--model", context.model);
    }

    return this.spawnProcess("agy", args, context, {
      shell: false,
    });
  }

  async getAvailableAgents(): Promise<string[]> {
    try {
      const cmd =
        os.platform() === "win32"
          ? "agy models < NUL"
          : "agy models < /dev/null";
      const { stdout, exitCode } = await this.processExecutor.exec(cmd, { timeout: 5000 });
      if (exitCode !== 0) {
        return [];
      }

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
    } catch {
      return [];
    }
  }
}
