import { AgentRunner } from "./AgentRunner.js";
import { AntigravityRunner } from "./AntigravityRunner.js";
import { ClaudeRunner } from "./ClaudeRunner.js";
import { CodexRunner } from "./CodexRunner.js";
import { CursorRunner } from "./CursorRunner.js";

export class RunnerFactory {
  static getAvailableEnvironments(): string[] {
    return ["antigravity", "claude", "codex", "cursor"];
  }

  static createRunner(environment: string): AgentRunner {
    switch (environment.toLowerCase()) {
      case "antigravity":
        return new AntigravityRunner();
      case "claude":
        return new ClaudeRunner();
      case "codex":
        return new CodexRunner();
      case "cursor":
        return new CursorRunner();
      default:
        throw new Error(`Unsupported environment: ${environment}`);
    }
  }
}
