import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";
import { SpecSource } from "../ports/SpecSource.js";
import { FetchedSpec } from "../../domain/spec-source.js";

export interface PullSpecOptions {
  id: string;
  customName?: string;
  specSource?: SpecSource;
}

export type PullSpecResult =
  | { kind: "not-initialized" }
  | { kind: "fetch-failed"; error: string }
  | { kind: "error"; error: string }
  | {
      kind: "success";
      filePath: string;
      filename: string;
      spec: FetchedSpec;
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

export function formatSpecMarkdown(sourceName: string, spec: FetchedSpec): string {
  const url = spec.url ? spec.url : "N/A";
  const description = spec.description ? spec.description.trim() : "";
  return [
    `# [${spec.id}] ${spec.title}`,
    "",
    `> **Source:** ${sourceName} | **URL:** ${url}`,
    "",
    "## Description",
    "",
    description,
    "",
  ].join("\n");
}

export class PullSpecUseCase {
  constructor(
    private readonly gw: WorkspaceGateway,
    private readonly defaultSpecSource?: SpecSource,
  ) {}

  async execute(options: PullSpecOptions): Promise<PullSpecResult> {
    if (!this.gw.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const source = options.specSource ?? this.defaultSpecSource;
    if (!source) {
      return { kind: "error", error: "No SpecSource configured or provided." };
    }

    let spec: FetchedSpec;
    try {
      spec = await source.fetch(options.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { kind: "fetch-failed", error: message };
    }

    const baseName = options.customName?.trim() ? options.customName : options.id;
    const filename = sanitizeFilename(baseName) || "spec";
    const filePath = PATHS.specFile(filename);

    if (!this.gw.exists(PATHS.specsDir)) {
      this.gw.mkdir(PATHS.specsDir);
    }

    const overwritten = this.gw.exists(filePath);
    const content = formatSpecMarkdown(source.name, spec);

    this.gw.writeFile(filePath, content);

    return {
      kind: "success",
      filePath,
      filename,
      spec,
      content,
      overwritten,
    };
  }
}
