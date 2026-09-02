import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";

export class ListSpecsUseCase {
  constructor(private readonly gw: WorkspaceGateway) {}

  execute(): string[] {
    if (!this.gw.exists(PATHS.specsDir)) {
      return [];
    }

    const files = this.gw.listDir(PATHS.specsDir);
    const specs = files
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(".md", ""));

    return specs.sort();
  }
}
