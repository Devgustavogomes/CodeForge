import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";
import { IntentSource } from "../ports/IntentSource.js";
import { FetchedIntent } from "../../domain/intent-source.js";
import { IntentSourceFactory } from "../../infrastructure/intent-sources/IntentSourceFactory.js";

export interface PullIntentOptions {
  id: string;
  customName?: string;
  intentSource?: IntentSource;
  provider?: string;
}

export type PullIntentResult =
  | { kind: "not-initialized" }
  | { kind: "fetch-failed"; error: string }
  | { kind: "error"; error: string }
  | {
      kind: "success";
      filePath: string;
      filename: string;
      intent: FetchedIntent;
      content: string;
      overwritten: boolean;
    };

export function sanitizeFilename(name: string): string {
  const stripped = name.trim().replace(/\.md$/i, "");
  return stripped
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatIntentMarkdown(sourceName: string, intent: FetchedIntent): string {
  const url = intent.url ? intent.url : "N/A";
  const description = intent.description ? intent.description.trim() : "";
  return [
    `# [${intent.id}] ${intent.title}`,
    "",
    `> **Source:** ${sourceName} | **URL:** ${url}`,
    "",
    "## Description",
    "",
    description,
    "",
  ].join("\n");
}

export class PullIntentUseCase {
  constructor(
    private readonly gw: WorkspaceGateway,
    private readonly defaultIntentSource?: IntentSource,
  ) {}

  async execute(options: PullIntentOptions): Promise<PullIntentResult> {
    if (!this.gw.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    let source = options.intentSource ?? this.defaultIntentSource;
    if (!source && options.provider) {
      try {
        source = IntentSourceFactory.create(options.provider);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { kind: "error", error: message };
      }
    }

    if (!source) {
      return { kind: "error", error: "No IntentSource configured or provided." };
    }

    let intent: FetchedIntent;
    try {
      intent = await source.fetch(options.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { kind: "fetch-failed", error: message };
    }

    let filename: string;
    if (options.customName && options.customName.trim().length > 0) {
      filename = sanitizeFilename(options.customName);
    } else {
      filename = sanitizeFilename(intent.title || "");
      if (!filename) {
        filename = sanitizeFilename(intent.id || "");
      }
    }

    if (!filename) {
      filename = "intent";
    }

    const filePath = PATHS.intentFile(filename);

    if (!this.gw.exists(PATHS.intentsDir)) {
      this.gw.mkdir(PATHS.intentsDir);
    }

    const overwritten = this.gw.exists(filePath);
    const content = formatIntentMarkdown(source.name, intent);

    this.gw.writeFile(filePath, content);

    return {
      kind: "success",
      filePath,
      filename,
      intent,
      content,
      overwritten,
    };
  }
}
