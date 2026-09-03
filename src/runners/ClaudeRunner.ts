import { TaskContext } from "./AgentRunner.js";
import { BaseProcessRunner } from "./BaseProcessRunner.js";

export class ClaudeRunner extends BaseProcessRunner {
  async execute(context: TaskContext): Promise<void> {
    const args: string[] = [];

    if (context.model) {
      args.push("--model", context.model);
    }

    args.push("-p");

    return this.spawnProcess("claude", args, context, {
      shell: process.platform === "win32",
      pipePromptToStdin: true,
    });
  }

  async getAvailableAgents(): Promise<string[]> {
    return ["fable", "opus", "sonnet", "haiku"];
  }
}
