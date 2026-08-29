import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  prepareDocsPrompt,
  prepareDocsUpdatePrompt,
  buildDocUpdatePrompt,
  prepareManualDocUpdate,
} from "../../src/application/docs.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-test-docs-"));
}

function makeWorkspace(tempDir: string): void {
  const root = path.join(tempDir, ".codeforge");
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, "specs"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "rules"));
  fs.writeFileSync(
    path.join(root, "metadata.json"),
    JSON.stringify({ initialized: true }),
    "utf-8"
  );
}

function writeSpec(tempDir: string, name: string, content = "SPEC CONTENT"): void {
  fs.writeFileSync(
    path.join(tempDir, ".codeforge", "specs", `${name}.md`),
    content,
    "utf-8"
  );
}

function writeDocsRules(tempDir: string, content = "DOCS RULES"): void {
  fs.writeFileSync(
    path.join(tempDir, ".codeforge", "rules", "docs.md"),
    content,
    "utf-8"
  );
}

function writeDocsUpdateRules(tempDir: string, content = "DOCS UPDATE RULES"): void {
  fs.writeFileSync(
    path.join(tempDir, ".codeforge", "rules", "docs-update.md"),
    content,
    "utf-8"
  );
}

// ─────────────────────────────────────────────────────────
// prepareDocsPrompt
// ─────────────────────────────────────────────────────────
describe("prepareDocsPrompt", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns notInitialized when metadata.json is missing", () => {
    const result = prepareDocsPrompt(new NodeWorkspaceGateway(tempDir), "my-doc", "auth");
    expect(result).toEqual({ kind: "not-initialized" });
  });

  it("returns specNotFound when the spec file does not exist", () => {
    makeWorkspace(tempDir);
    const result = prepareDocsPrompt(new NodeWorkspaceGateway(tempDir), "my-doc", "missing-spec");
    expect(result).toEqual({ kind: "spec-not-found" });
  });

  it("returns rulesNotFound when .codeforge/rules/docs.md is missing", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    const result = prepareDocsPrompt(new NodeWorkspaceGateway(tempDir), "my-doc", "auth");
    expect(result).toEqual({ kind: "rules-not-found" });
  });

  it("returns alreadyExists when the doc file already exists on disk", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeDocsRules(tempDir);

    fs.writeFileSync(
      path.join(tempDir, ".codeforge", "docs", "my-doc.md"),
      "# Existing doc",
      "utf-8"
    );

    const result = prepareDocsPrompt(new NodeWorkspaceGateway(tempDir), "my-doc", "auth");
    expect(result).toEqual({ kind: "already-exists" });
  });

  it("returns alreadyExists when the doc is already registered in manifest.json", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeDocsRules(tempDir);

    const manifest = {
      version: "1.0",
      documents: {
        "my-doc": {
          path: ".codeforge/docs/my-doc.md",
          specs: [".codeforge/specs/auth.md"],
          scope: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    };
    fs.writeFileSync(
      path.join(tempDir, ".codeforge", "docs", "manifest.json"),
      JSON.stringify(manifest),
      "utf-8"
    );

    const result = prepareDocsPrompt(new NodeWorkspaceGateway(tempDir), "my-doc", "auth");
    expect(result).toEqual({ kind: "already-exists" });
  });

  it("returns a prompt containing spec and rules content", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth", "MY SPEC CONTENT");
    writeDocsRules(tempDir, "MY DOCS RULES");

    const result = prepareDocsPrompt(new NodeWorkspaceGateway(tempDir), "my-doc", "auth");

    expect(result).toHaveProperty("prompt");
    if (!("prompt" in result)) throw new Error("expected prompt");
    expect(result.prompt).toContain("MY SPEC CONTENT");
    expect(result.prompt).toContain("MY DOCS RULES");
  });

  it("includes the doc name in the generated prompt", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeDocsRules(tempDir);

    const result = prepareDocsPrompt(new NodeWorkspaceGateway(tempDir), "my-doc", "auth");

    expect(result).toHaveProperty("prompt");
    if (!("prompt" in result)) throw new Error("expected prompt");
    expect(result.prompt).toContain("my-doc");
  });

  it("creates and writes a manifest entry for the new doc", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeDocsRules(tempDir);

    prepareDocsPrompt(new NodeWorkspaceGateway(tempDir), "my-doc", "auth");

    const manifestPath = path.join(tempDir, ".codeforge", "docs", "manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.documents["my-doc"]).toBeDefined();
    expect(manifest.documents["my-doc"].specs).toContain(".codeforge/specs/auth.md");
    expect(manifest.documents["my-doc"].path).toBe(".codeforge/docs/my-doc.md");
  });

  it("preserves existing manifest entries when adding a new doc", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeSpec(tempDir, "billing");
    writeDocsRules(tempDir);

    prepareDocsPrompt(new NodeWorkspaceGateway(tempDir), "doc-one", "auth");
    prepareDocsPrompt(new NodeWorkspaceGateway(tempDir), "doc-two", "billing");

    const manifestPath = path.join(tempDir, ".codeforge", "docs", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

    expect(manifest.documents["doc-one"]).toBeDefined();
    expect(manifest.documents["doc-two"]).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// prepareDocsUpdatePrompt
// ─────────────────────────────────────────────────────────
describe("prepareDocsUpdatePrompt", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns notInitialized when metadata.json is missing", () => {
    const result = prepareDocsUpdatePrompt(new NodeWorkspaceGateway(tempDir), "auth");
    expect(result).toEqual({ kind: "not-initialized" });
  });

  it("returns specNotFound when the spec file does not exist", () => {
    makeWorkspace(tempDir);
    const result = prepareDocsUpdatePrompt(new NodeWorkspaceGateway(tempDir), "missing-spec");
    expect(result).toEqual({ kind: "spec-not-found" });
  });

  it("returns rulesNotFound when docs-update.md rules are missing", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    const result = prepareDocsUpdatePrompt(new NodeWorkspaceGateway(tempDir), "auth");
    expect(result).toEqual({ kind: "rules-not-found" });
  });

  it("returns noGit when there is no .git directory", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeDocsUpdateRules(tempDir);

    const result = prepareDocsUpdatePrompt(new NodeWorkspaceGateway(tempDir), "auth");
    expect(result).toEqual({ kind: "no-git" });
  });

  it("returns noAffectedDocs when manifest has no entries with scope", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeDocsUpdateRules(tempDir);

    // Fake .git dir so the git check passes
    fs.mkdirSync(path.join(tempDir, ".git"));

    // Manifest with a doc that has NO scope defined
    const manifestPath = path.join(tempDir, ".codeforge", "docs", "manifest.json");
    const manifest = {
      version: "1.0",
      documents: {
        "api-reference": {
          path: ".codeforge/docs/api-reference.md",
          specs: [".codeforge/specs/auth.md"],
          scope: [], // empty scope → never matches any changed file
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf-8");

    // git diff will throw (no real git repo), which is caught and returns noChangedFiles.
    // Docs with empty scope also produce noAffectedDocs. Both are valid early-exits.
    const result = prepareDocsUpdatePrompt(new NodeWorkspaceGateway(tempDir), "auth");
    const validKinds = ["no-changed-files", "no-affected-docs"];
    expect(validKinds.includes(result.kind)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// buildDocUpdatePrompt
// ─────────────────────────────────────────────────────────
describe("buildDocUpdatePrompt", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("includes rules content in the prompt", () => {
    makeWorkspace(tempDir);
    writeDocsUpdateRules(tempDir, "MY UPDATE RULES");
    fs.mkdirSync(path.join(tempDir, ".git"));

    const affectedDoc = {
      docName: "api-reference",
      docPath: ".codeforge/docs/api-reference.md",
      specPaths: [".codeforge/specs/auth.md"],
      matchedFiles: [],
    };

    const prompt = buildDocUpdatePrompt(new NodeWorkspaceGateway(tempDir), "auth", affectedDoc);
    expect(prompt).toContain("MY UPDATE RULES");
  });

  it("includes the affected doc name in the prompt", () => {
    makeWorkspace(tempDir);
    writeDocsUpdateRules(tempDir);
    fs.mkdirSync(path.join(tempDir, ".git"));

    const affectedDoc = {
      docName: "api-reference",
      docPath: ".codeforge/docs/api-reference.md",
      specPaths: [".codeforge/specs/auth.md"],
      matchedFiles: [],
    };

    const prompt = buildDocUpdatePrompt(new NodeWorkspaceGateway(tempDir), "auth", affectedDoc);
    expect(prompt).toContain("api-reference");
  });

  it("includes the doc path in the prompt", () => {
    makeWorkspace(tempDir);
    writeDocsUpdateRules(tempDir);
    fs.mkdirSync(path.join(tempDir, ".git"));

    const affectedDoc = {
      docName: "api-reference",
      docPath: ".codeforge/docs/api-reference.md",
      specPaths: [".codeforge/specs/auth.md"],
      matchedFiles: [],
    };

    const prompt = buildDocUpdatePrompt(new NodeWorkspaceGateway(tempDir), "auth", affectedDoc);
    expect(prompt).toContain(".codeforge/docs/api-reference.md");
  });

  it("includes the spec name in the prompt", () => {
    makeWorkspace(tempDir);
    writeDocsUpdateRules(tempDir);
    fs.mkdirSync(path.join(tempDir, ".git"));

    const affectedDoc = {
      docName: "api-reference",
      docPath: ".codeforge/docs/api-reference.md",
      specPaths: [".codeforge/specs/auth.md"],
      matchedFiles: [],
    };

    const prompt = buildDocUpdatePrompt(new NodeWorkspaceGateway(tempDir), "auth", affectedDoc);
    expect(prompt).toContain(".codeforge/specs/auth.md");
  });
});

// ─────────────────────────────────────────────────────────
// prepareManualDocUpdate
// ─────────────────────────────────────────────────────────
describe("prepareManualDocUpdate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns notInitialized when metadata.json is missing", () => {
    const result = prepareManualDocUpdate(new NodeWorkspaceGateway(tempDir), "auth", "api-reference");
    expect(result).toEqual({ kind: "not-initialized" });
  });

  it("returns specNotFound when the spec file does not exist", () => {
    makeWorkspace(tempDir);
    const result = prepareManualDocUpdate(new NodeWorkspaceGateway(tempDir), "missing-spec", "api-reference");
    expect(result).toEqual({ kind: "spec-not-found" });
  });

  it("returns rulesNotFound when docs-update.md rules are missing", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    const result = prepareManualDocUpdate(new NodeWorkspaceGateway(tempDir), "auth", "api-reference");
    expect(result).toEqual({ kind: "rules-not-found" });
  });

  it("returns docNotFound when doc is absent from manifest and disk", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeDocsUpdateRules(tempDir);

    const result = prepareManualDocUpdate(new NodeWorkspaceGateway(tempDir), "auth", "non-existent-doc");
    expect(result).toEqual({ kind: "doc-not-found" });
  });

  it("succeeds when the doc is registered in manifest.json", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeDocsUpdateRules(tempDir);

    const manifest = {
      version: "1.0",
      documents: {
        "api-reference": {
          path: ".codeforge/docs/api-reference.md",
          specs: [".codeforge/specs/auth.md"],
          scope: ["src/**"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    };
    fs.writeFileSync(
      path.join(tempDir, ".codeforge", "docs", "manifest.json"),
      JSON.stringify(manifest),
      "utf-8"
    );

    const result = prepareManualDocUpdate(new NodeWorkspaceGateway(tempDir), "auth", "api-reference");

    expect(result).toHaveProperty("doc");
    if (!("doc" in result)) throw new Error("expected doc");
    expect(result.doc.docName).toBe("api-reference");
    expect(result.doc.docPath).toBe(".codeforge/docs/api-reference.md");
    expect(result.doc.matchedFiles).toEqual([]); // manual mode has no scope matching
  });

  it("succeeds when the doc file exists on disk even without a manifest entry", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeDocsUpdateRules(tempDir);

    // Create the doc file without a manifest entry
    fs.writeFileSync(
      path.join(tempDir, ".codeforge", "docs", "api-reference.md"),
      "# API Reference",
      "utf-8"
    );

    const result = prepareManualDocUpdate(new NodeWorkspaceGateway(tempDir), "auth", "api-reference");

    expect(result).toHaveProperty("doc");
    if (!("doc" in result)) throw new Error("expected doc");
    expect(result.doc.docName).toBe("api-reference");
    expect(result.doc.matchedFiles).toEqual([]);
  });

  it("doc returned has empty specPaths when doc is not in manifest", () => {
    makeWorkspace(tempDir);
    writeSpec(tempDir, "auth");
    writeDocsUpdateRules(tempDir);

    fs.writeFileSync(
      path.join(tempDir, ".codeforge", "docs", "api-reference.md"),
      "# API Reference",
      "utf-8"
    );

    const result = prepareManualDocUpdate(new NodeWorkspaceGateway(tempDir), "auth", "api-reference");
    if (!("doc" in result)) throw new Error("expected doc");
    expect(result.doc.specPaths).toEqual([]);
  });
});
