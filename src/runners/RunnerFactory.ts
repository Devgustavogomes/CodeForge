import { AgentRunner } from "./AgentRunner.js";
import { AntigravityRunner } from "./AntigravityRunner.js";
import { ClaudeRunner } from "./ClaudeRunner.js";
import { CodexRunner } from "./CodexRunner.js";
import { CursorRunner } from "./CursorRunner.js";
import { ProcessExecutor } from "../infrastructure/process/ProcessExecutor.js";

export class RunnerFactory {
  static getAvailableEnvironments(): string[] {
    return ["antigravity", "claude", "codex", "cursor"];
  }

  static createRunner(environment: string, processExecutor?: ProcessExecutor): AgentRunner {
    switch (environment.toLowerCase()) {
      case "antigravity":
        return new AntigravityRunner(processExecutor);
      case "claude":
        return new ClaudeRunner(processExecutor);
      case "codex":
        return new CodexRunner(processExecutor);
      case "cursor":
        return new CursorRunner(processExecutor);
      default:
        throw new Error(`Unsupported environment: ${environment}`);
    }
  }
}
