import { TaskContext } from "./AgentRunner.js";
import { BaseProcessRunner } from "./BaseProcessRunner.js";

export class CodexRunner extends BaseProcessRunner {
  async execute(context: TaskContext): Promise<void> {
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

    return this.spawnProcess("codex", args, context, {
      // Codex ships as an executable on Windows. A shell is unnecessary here
      // and makes Node emit DEP0190 directly on CodeForge's stderr.
      shell: false,
      cwd: process.cwd(),
      pipePromptToStdin: true,
    });
  }

  async getAvailableAgents(): Promise<string[]> {
    return [
      "gpt-6-astra",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
    ];
  }
}
