import { FetchedIntent, IntentReference, IntentSourceConfig } from "../../domain/intent-source.js";
import { ListIntentOptions, IntentSource } from "../../application/ports/IntentSource.js";
import { PATHS } from "../paths.js";
import { NodeWorkspaceGateway, WorkspaceGateway } from "../workspace.js";

export class FilesystemIntentSource implements IntentSource {
  readonly name = "filesystem";
  private readonly gw: WorkspaceGateway;

  constructor(
    private readonly config?: IntentSourceConfig,
    gw?: WorkspaceGateway
  ) {
    this.gw = gw ?? new NodeWorkspaceGateway(process.cwd());
  }

  async list(options?: ListIntentOptions): Promise<IntentReference[]> {
    if (!this.gw.exists(PATHS.intentsDir)) {
      return [];
    }

    const files = this.gw.listDir(PATHS.intentsDir);
    const mdFiles = files.filter((file) => file.endsWith(".md")).sort();

    const results: IntentReference[] = [];
    for (const file of mdFiles) {
      const id = file.replace(/\.md$/, "");
      const filePath = PATHS.intentFile(id);
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

  async fetch(id: string): Promise<FetchedIntent> {
    const cleanId = id.replace(/\.md$/, "");
    const filePath = PATHS.intentFile(cleanId);

    if (!this.gw.exists(filePath)) {
      throw new Error(
        `Local intent "${id}" not found in ${PATHS.intentsDir}. The filesystem provider operates directly on local files. To pull remote intents, use an external provider (e.g. linear, github, clickup) or create a local intent using "codeforge intent create".`
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
