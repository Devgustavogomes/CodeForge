import { FetchedSpec, SpecReference, SpecSourceConfig } from "../../domain/spec-source.js";
import { ListSpecOptions, SpecSource } from "../../application/ports/SpecSource.js";
import { PATHS } from "../paths.js";
import { NodeWorkspaceGateway, WorkspaceGateway } from "../workspace.js";

export class FilesystemSpecSource implements SpecSource {
  readonly name = "filesystem";
  private readonly gw: WorkspaceGateway;

  constructor(
    private readonly config?: SpecSourceConfig,
    gw?: WorkspaceGateway
  ) {
    this.gw = gw ?? new NodeWorkspaceGateway(process.cwd());
  }

  async list(options?: ListSpecOptions): Promise<SpecReference[]> {
    if (!this.gw.exists(PATHS.specsDir)) {
      return [];
    }

    const files = this.gw.listDir(PATHS.specsDir);
    const mdFiles = files.filter((file) => file.endsWith(".md")).sort();

    const results: SpecReference[] = [];
    for (const file of mdFiles) {
      const id = file.replace(/\.md$/, "");
      const filePath = PATHS.specFile(id);
      let title = id;

      try {
        if (this.gw.exists(filePath)) {
          const content = this.gw.readFile(filePath);
          const match = content.match(/^#\s+(.+)$/m);
          if (match && match[1]?.trim()) {
            title = match[1].trim();
          }
        }
      } catch {
        // Fallback to id if file read fails
      }

      results.push({
        id,
        title,
      });

      if (options?.limit && results.length >= options.limit) {
        break;
      }
    }

    return results;
  }

  async fetch(id: string): Promise<FetchedSpec> {
    const cleanId = id.replace(/\.md$/, "");
    const filePath = PATHS.specFile(cleanId);

    if (!this.gw.exists(filePath)) {
      throw new Error(
        `Local spec "${id}" not found in ${PATHS.specsDir}. The filesystem provider operates directly on local files. To pull remote specs, use an external provider (e.g. linear, github, clickup) or create a local spec using "codeforge spec create".`
      );
    }

    const content = this.gw.readFile(filePath);
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch && titleMatch[1]?.trim() ? titleMatch[1].trim() : cleanId;
    const description = titleMatch
      ? content.replace(/^#\s+[^\r\n]+[\r\n]*/, "").trim()
      : content.trim();

    return {
      id: cleanId,
      title,
      description,
      metadata: {
        source: "filesystem",
        filePath,
      },
    };
  }
}
