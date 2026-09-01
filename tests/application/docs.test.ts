import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { prepareDocsPrompt } from "../../src/application/docs.js";
import { UpdateDocUseCase } from "../../src/application/use-cases/UpdateDocUseCase.js";
import { GitGateway } from "../../src/infrastructure/git/GitGateway.js";
import { AgentRunner } from "../../src/runners/AgentRunner.js";
import { CodeForgeConfig } from "../../src/config/types.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/specs");
  gateway.mkdir(".codeforge/docs");
  gateway.mkdir(".codeforge/rules");
  gateway.writeFile(
    ".codeforge/metadata.json",
    JSON.stringify({ initialized: true }),
  );
}

function writeSpec(
  gateway: InMemoryWorkspaceGateway,
  name: string,
  content = "SPEC CONTENT",
): void {
  gateway.writeFile(`.codeforge/specs/${name}.md`, content);
}

function writeDocsRules(
  gateway: InMemoryWorkspaceGateway,
  content = "DOCS RULES",
): void {
  gateway.writeFile(".codeforge/rules/docs.md", content);
}

function writeDocsUpdateRules(
  gateway: InMemoryWorkspaceGateway,
  content = "DOCS UPDATE RULES",
): void {
  gateway.writeFile(".codeforge/rules/docs-update.md", content);
}

// ─────────────────────────────────────────────────────────
// prepareDocsPrompt
// ─────────────────────────────────────────────────────────
describe("prepareDocsPrompt", () => {
  let gateway: InMemoryWorkspaceGateway;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
  });

  it("returns notInitialized when metadata.json is missing", () => {
    const result = prepareDocsPrompt(gateway, "my-doc", "auth", "pt-BR");
    expect(result).toEqual({ kind: "not-initialized" });
  });

  it("returns specNotFound when the spec file does not exist", () => {
    makeWorkspace(gateway);
    const result = prepareDocsPrompt(gateway, "my-doc", "missing-spec", "pt-BR");
    expect(result).toEqual({ kind: "spec-not-found" });
  });

  it("returns rulesNotFound when .codeforge/rules/docs.md is missing", () => {
    makeWorkspace(gateway);
    writeSpec(gateway, "auth");
    const result = prepareDocsPrompt(gateway, "my-doc", "auth", "pt-BR");
    expect(result).toEqual({ kind: "rules-not-found" });
  });

  it("returns alreadyExists when the doc file already exists on disk", () => {
    makeWorkspace(gateway);
    writeSpec(gateway, "auth");
    writeDocsRules(gateway);

    gateway.writeFile(".codeforge/docs/my-doc.md", "# Existing doc");

    const result = prepareDocsPrompt(gateway, "my-doc", "auth", "pt-BR");
    expect(result).toEqual({ kind: "already-exists" });
  });

  it("returns alreadyExists when the doc is already registered in manifest.json", () => {
    makeWorkspace(gateway);
    writeSpec(gateway, "auth");
    writeDocsRules(gateway);

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
    gateway.writeFile(
      ".codeforge/docs/manifest.json",
      JSON.stringify(manifest),
    );

    const result = prepareDocsPrompt(gateway, "my-doc", "auth", "en");
    expect(result).toEqual({ kind: "already-exists" });
  });

  it("returns a prompt containing spec and rules content", () => {
    makeWorkspace(gateway);
    writeSpec(gateway, "auth", "MY SPEC CONTENT");
    writeDocsRules(gateway, "MY DOCS RULES");

    const result = prepareDocsPrompt(gateway, "my-doc", "auth", "en");

    expect(result).toHaveProperty("prompt");
    if (!("prompt" in result)) throw new Error("expected prompt");
    expect(result.prompt).toContain("MY SPEC CONTENT");
    expect(result.prompt).toContain("MY DOCS RULES");
  });

  it("includes the doc name in the generated prompt", () => {
    makeWorkspace(gateway);
    writeSpec(gateway, "auth");
    writeDocsRules(gateway);

    const result = prepareDocsPrompt(gateway, "my-doc", "auth", "en");

    expect(result).toHaveProperty("prompt");
    if (!("prompt" in result)) throw new Error("expected prompt");
    expect(result.prompt).toContain("my-doc");
  });

  it("creates and writes a manifest entry for the new doc", () => {
    makeWorkspace(gateway);
    writeSpec(gateway, "auth");
    writeDocsRules(gateway);

    prepareDocsPrompt(gateway, "my-doc", "auth", "en");

    expect(gateway.exists(".codeforge/docs/manifest.json")).toBe(true);

    const manifest = JSON.parse(
      gateway.readFile(".codeforge/docs/manifest.json"),
    );
    expect(manifest.documents["my-doc"]).toBeDefined();
    expect(manifest.documents["my-doc"].specs).toContain(
      ".codeforge/specs/auth.md",
    );
    expect(manifest.documents["my-doc"].path).toBe(".codeforge/docs/my-doc.md");
  });

  it("preserves existing manifest entries when adding a new doc", () => {
    makeWorkspace(gateway);
    writeSpec(gateway, "auth");
    writeSpec(gateway, "billing");
    writeDocsRules(gateway);

    prepareDocsPrompt(gateway, "doc-one", "auth", "en");
    prepareDocsPrompt(gateway, "doc-two", "billing", "en");

    const manifest = JSON.parse(
      gateway.readFile(".codeforge/docs/manifest.json"),
    );

    expect(manifest.documents["doc-one"]).toBeDefined();
    expect(manifest.documents["doc-two"]).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// UpdateDocUseCase
// ─────────────────────────────────────────────────────────
describe("UpdateDocUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let mockGit: GitGateway;
  let mockRunner: AgentRunner;
  let mockConfig: CodeForgeConfig;
  let useCase: UpdateDocUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    mockGit = {
      hasRepository: () => true,
      getChangedFiles: () => [],
      getFileDiff: () => null,
    };
    mockRunner = {
      execute: async () => ({ status: "success", tasks: [] }) as any,
    } as any;
    mockConfig = {
      environment: "test",
      plannerAgent: "mock-planner",
      executorAgent: "mock-executor",
      language: "en",
      humanInTheLoop: true,
    };
    useCase = new UpdateDocUseCase(gateway, mockGit, mockRunner, mockConfig);
  });

  describe("getAffectedDocs", () => {
    it("returns notInitialized when metadata.json is missing", () => {
      const result = useCase.getAffectedDocs("auth");
      expect(result).toEqual({ kind: "not-initialized" });
    });

    it("returns specNotFound when the spec file does not exist", () => {
      makeWorkspace(gateway);
      const result = useCase.getAffectedDocs("missing-spec");
      expect(result).toEqual({ kind: "spec-not-found" });
    });

    it("returns rulesNotFound when docs-update.md rules are missing", () => {
      makeWorkspace(gateway);
      writeSpec(gateway, "auth");
      const result = useCase.getAffectedDocs("auth");
      expect(result).toEqual({ kind: "rules-not-found" });
    });

    it("returns noGit when there is no .git directory (hasRepository returns false)", () => {
      makeWorkspace(gateway);
      writeSpec(gateway, "auth");
      writeDocsUpdateRules(gateway);
      mockGit.hasRepository = () => false;

      const result = useCase.getAffectedDocs("auth");
      expect(result).toEqual({ kind: "no-git" });
    });

    it("returns noAffectedDocs when manifest has no entries with scope", () => {
      makeWorkspace(gateway);
      writeSpec(gateway, "auth");
      writeDocsUpdateRules(gateway);
      mockGit.getChangedFiles = () => ["src/some-file.ts"];

      const manifest = {
        version: "1.0",
        documents: {
          "api-reference": {
            path: ".codeforge/docs/api-reference.md",
            specs: [".codeforge/specs/auth.md"],
            scope: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };
      gateway.writeFile(
        ".codeforge/docs/manifest.json",
        JSON.stringify(manifest),
      );

      const result = useCase.getAffectedDocs("auth");
      expect(result.kind).toBe("no-affected-docs");
    });
  });

  describe("getManualDoc", () => {
    it("returns notInitialized when metadata.json is missing", () => {
      const result = useCase.getManualDoc("auth", "api-reference");
      expect(result).toEqual({ kind: "not-initialized" });
    });

    it("returns specNotFound when the spec file does not exist", () => {
      makeWorkspace(gateway);
      const result = useCase.getManualDoc("missing-spec", "api-reference");
      expect(result).toEqual({ kind: "spec-not-found" });
    });

    it("returns rulesNotFound when docs-update.md rules are missing", () => {
      makeWorkspace(gateway);
      writeSpec(gateway, "auth");
      const result = useCase.getManualDoc("auth", "api-reference");
      expect(result).toEqual({ kind: "rules-not-found" });
    });

    it("returns docNotFound when doc is absent from manifest and disk", () => {
      makeWorkspace(gateway);
      writeSpec(gateway, "auth");
      writeDocsUpdateRules(gateway);

      const result = useCase.getManualDoc("auth", "non-existent-doc");
      expect(result).toEqual({ kind: "doc-not-found" });
    });

    it("succeeds when the doc is registered in manifest.json", () => {
      makeWorkspace(gateway);
      writeSpec(gateway, "auth");
      writeDocsUpdateRules(gateway);

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
      gateway.writeFile(
        ".codeforge/docs/manifest.json",
        JSON.stringify(manifest),
      );

      const result = useCase.getManualDoc("auth", "api-reference");

      expect(result).toHaveProperty("doc");
      if (!("doc" in result)) throw new Error("expected doc");
      expect(result.doc.docName).toBe("api-reference");
      expect(result.doc.docPath).toBe(".codeforge/docs/api-reference.md");
      expect(result.doc.matchedFiles).toEqual([]);
    });
  });
});
