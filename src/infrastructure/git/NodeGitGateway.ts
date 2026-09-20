import { execFileSync } from "node:child_process";
import { GitGateway } from "./GitGateway.js";
import { WorkspaceGateway } from "../workspace.js";

export class NodeGitGateway implements GitGateway {
  constructor(private readonly gw: WorkspaceGateway) {}

  hasRepository(): boolean {
    return this.gw.exists(".git");
  }

  getChangedFiles(): string[] {
    try {
      const diffOutput = execFileSync("git", ["diff", "HEAD", "--name-only"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();

      if (!diffOutput) {
        return [];
      }

      return diffOutput
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }

  getFileDiff(filePath: string): string | null {
    try {
      const diff = execFileSync("git", ["diff", "HEAD", "--", filePath], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      return diff || null;
    } catch {
      return null;
    }
  }
}
