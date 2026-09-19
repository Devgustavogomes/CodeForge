import { beforeEach, describe, expect, it } from "vitest";
import { DeleteDocUseCase } from "../../src/application/use-cases/DeleteDocUseCase.js";
import { DocsManifestEntry } from "../../src/domain/doc.js";
import { PATHS } from "../../src/infrastructure/paths.js";
import { DocsManifestRepository } from "../../src/infrastructure/repositories/DocsManifestRepository.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";

const createdAt = "2026-01-01T00:00:00.000Z";
const updatedAt = "2026-01-02T00:00:00.000Z";

function manifestEntry(
  path: string,
  overrides: Partial<DocsManifestEntry> = {},
): DocsManifestEntry {
  return {
    path,
    intents: [".codeforge/intents/example.md"],
    scope: ["src/**"],
    createdAt,
    updatedAt,
    ...overrides,
  };
}

describe("DeleteDocUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let manifestRepository: DocsManifestRepository;
  let useCase: DeleteDocUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    manifestRepository = new DocsManifestRepository(gateway);
    useCase = new DeleteDocUseCase(gateway, manifestRepository);
  });

  it("returns not-initialized without mutating the document or manifest", () => {
    const docPath = ".codeforge/docs/guide.md";
    const docContent = "# Guide\n\nKeep this content.";
    const manifest = {
      version: "1.0",
      documents: { guide: manifestEntry(docPath) },
    };
    const manifestContent = JSON.stringify(manifest);
    gateway.writeFile(docPath, docContent);
    gateway.writeFile(PATHS.docsManifest, manifestContent);

    const result = useCase.execute("guide");

    expect(result).toEqual({ kind: "not-initialized" });
    expect(gateway.readFile(docPath)).toBe(docContent);
    expect(gateway.readFile(PATHS.docsManifest)).toBe(manifestContent);
  });

  it("returns doc-not-found without changing the manifest", () => {
    gateway.writeFile(PATHS.metadata, JSON.stringify({ initialized: true }));
    const existingPath = ".codeforge/docs/existing.md";
    const existingContent = "# Existing";
    const manifest = {
      version: "1.0",
      documents: { existing: manifestEntry(existingPath) },
    };
    const manifestContent = JSON.stringify(manifest);
    gateway.writeFile(existingPath, existingContent);
    gateway.writeFile(PATHS.docsManifest, manifestContent);

    const result = useCase.execute("missing");

    expect(result).toEqual({ kind: "doc-not-found" });
    expect(gateway.readFile(PATHS.docsManifest)).toBe(manifestContent);
    expect(gateway.readFile(existingPath)).toBe(existingContent);
  });

  it("deletes the manifest-owned Markdown file and its document entry", () => {
    gateway.writeFile(PATHS.metadata, JSON.stringify({ initialized: true }));
    const referencedPath = ".codeforge/docs/custom-location.md";
    gateway.writeFile(referencedPath, "# Generated document");
    manifestRepository.save({
      version: "1.0",
      documents: { guide: manifestEntry(referencedPath) },
    });

    const result = useCase.execute("guide");

    expect(result).toEqual({ kind: "deleted", docName: "guide" });
    expect(gateway.exists(referencedPath)).toBe(false);
    expect(manifestRepository.load()).toEqual({
      version: "1.0",
      documents: {},
    });
  });

  it("removes a stale manifest entry when its referenced file is absent", () => {
    gateway.writeFile(PATHS.metadata, JSON.stringify({ initialized: true }));
    const missingPath = ".codeforge/docs/already-absent.md";
    manifestRepository.save({
      version: "1.0",
      documents: { stale: manifestEntry(missingPath) },
    });

    const result = useCase.execute("stale");

    expect(result).toEqual({ kind: "deleted", docName: "stale" });
    expect(gateway.exists(missingPath)).toBe(false);
    expect(manifestRepository.load().documents).toEqual({});
  });

  it("preserves unrelated manifest entries, associations, and files", () => {
    gateway.writeFile(PATHS.metadata, JSON.stringify({ initialized: true }));
    const deletedPath = ".codeforge/docs/delete-me.md";
    const keptPath = ".codeforge/docs/keep-me.md";
    const unrelatedPath = ".codeforge/docs/notes.txt";
    const keptContent = "# Keep me\n\nByte-for-byte content.\n";
    const unrelatedContent = "unrelated bytes\r\n";
    const keptEntry = manifestEntry(keptPath, {
      intents: [".codeforge/intents/auth.md", ".codeforge/intents/billing.md"],
      scope: ["src/auth/**", "src/billing/**"],
    });
    gateway.writeFile(deletedPath, "# Delete me");
    gateway.writeFile(keptPath, keptContent);
    gateway.writeFile(unrelatedPath, unrelatedContent);
    manifestRepository.save({
      version: "2.5",
      documents: {
        "delete-me": manifestEntry(deletedPath),
        "keep-me": keptEntry,
      },
    });

    const result = useCase.execute("delete-me");

    expect(result).toEqual({ kind: "deleted", docName: "delete-me" });
    expect(manifestRepository.load()).toEqual({
      version: "2.5",
      documents: { "keep-me": keptEntry },
    });
    expect(gateway.readFile(keptPath)).toBe(keptContent);
    expect(gateway.readFile(unrelatedPath)).toBe(unrelatedContent);
  });
});
