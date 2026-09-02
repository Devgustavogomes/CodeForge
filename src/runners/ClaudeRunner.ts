import { TaskContext } from "./AgentRunner.js";
import { BaseProcessRunner } from "./BaseProcessRunner.js";

export class ClaudeRunner extends BaseProcessRunner {
  async execute(context: TaskContext): Promise<void> {
    const args = ["-p", context.promptFilePath];
    if (context.model) {
      args.unshift("-m", context.model);
    }

    return this.spawnProcess("claude", args, context, {
      shell: false,
    });
  }

  async getAvailableAgents(): Promise<string[]> {
    return ["fable", "opus", "sonnet", "haiku"];
  }
}
