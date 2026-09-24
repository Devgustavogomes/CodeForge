import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CreateDocUseCase } from "../../src/application/use-cases/CreateDocUseCase.js";
import { UpdateDocUseCase } from "../../src/application/use-cases/UpdateDocUseCase.js";
import { GitGateway } from "../../src/infrastructure/git/GitGateway.js";
import { AgentRunner } from "../../src/runners/AgentRunner.js";
import { CodeForgeConfig } from "../../src/config/types.js";
import { PATHS } from "../../src/infrastructure/paths.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(PATHS.intentsDir);
  gateway.mkdir(".codeforge/docs");
  gateway.mkdir(".codeforge/rules");
  gateway.writeFile(
    ".codeforge/metadata.json",
    JSON.stringify({ initialized: true }),
  );
}

function writeIntent(
  gateway: InMemoryWorkspaceGateway,
  name: string,
  content = "INTENT CONTENT",
): void {
  gateway.writeFile(PATHS.intentFile(name), content);
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
// CreateDocUseCase & buildDocsCreatePrompt
// ─────────────────────────────────────────────────────────
describe("CreateDocUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let runner: AgentRunner;
  let config: CodeForgeConfig;
  let useCase: CreateDocUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    runner = { execute: vi.fn().mockResolvedValue(undefined) };
    config = {
      environment: "test",
      plannerAgent: "mock-planner",
      executorAgent: "mock-executor",
      language: "en",
    };
    useCase = new CreateDocUseCase(gateway, runner, config);
  });

  it("returns notInitialized when metadata.json is missing", async () => {
    const result = await useCase.execute("my-doc", "auth");
    expect(result).toEqual({ kind: "not-initialized" });
  });

  it("returns intentNotFound when the intent file does not exist", async () => {
    makeWorkspace(gateway);
    const result = await useCase.execute("my-doc", "missing-intent");
    expect(result).toEqual({ kind: "intent-not-found" });
  });

  it("returns alreadyExists when the doc file already exists on disk", async () => {
    makeWorkspace(gateway);
    writeIntent(gateway, "auth");
    writeDocsRules(gateway);

    gateway.writeFile(".codeforge/docs/my-doc.md", "# Existing doc");

    const result = await useCase.execute("my-doc", "auth");
    expect(result).toEqual({ kind: "already-exists" });
  });

  it("returns alreadyExists when the doc is already registered in manifest.json", async () => {
    makeWorkspace(gateway);
    writeIntent(gateway, "auth");
    writeDocsRules(gateway);

    const manifest = {
      version: "1.0",
      documents: {
        "my-doc": {
          path: ".codeforge/docs/my-doc.md",
          intents: [PATHS.intentFile("auth")],
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

    const result = await useCase.execute("my-doc", "auth");
    expect(result).toEqual({ kind: "already-exists" });
  });

  it("creates and writes a manifest entry for the new doc and executes runner", async () => {
    makeWorkspace(gateway);
    writeIntent(gateway, "auth");
    writeDocsRules(gateway);

    const result = await useCase.execute("my-doc", "auth");

    expect(result).toEqual({ kind: "success" });
    expect(runner.execute).toHaveBeenCalled();
    expect(gateway.exists(".codeforge/docs/manifest.json")).toBe(true);

    const manifest = JSON.parse(
      gateway.readFile(".codeforge/docs/manifest.json"),
    );
    expect(manifest.documents["my-doc"]).toBeDefined();
    expect(manifest.documents["my-doc"].intents).toEqual(
      expect.arrayContaining([PATHS.intentFile("auth")]),
    );
    expect(manifest.documents["my-doc"].path).toBe(".codeforge/docs/my-doc.md");
  });

  it("preserves existing manifest entries when adding a new doc", async () => {
    makeWorkspace(gateway);
    writeIntent(gateway, "auth");
    writeIntent(gateway, "billing");
    writeDocsRules(gateway);

    await useCase.execute("doc-one", "auth");
    await useCase.execute("doc-two", "billing");

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
    };
    useCase = new UpdateDocUseCase(gateway, mockGit, mockRunner, mockConfig);
  });

  describe("getAffectedDocs", () => {
    it("returns notInitialized when metadata.json is missing", () => {
      const result = useCase.getAffectedDocs("auth");
      expect(result).toEqual({ kind: "not-initialized" });
    });

    it("returns intentNotFound when the intent file does not exist", () => {
      makeWorkspace(gateway);
      const result = useCase.getAffectedDocs("missing-intent");
      expect(result).toEqual({ kind: "intent-not-found" });
    });

    it("continues when docs-update.md rules are missing", () => {
      makeWorkspace(gateway);
      writeIntent(gateway, "auth");
      const result = useCase.getAffectedDocs("auth");
      expect(result).toEqual({ kind: "no-changed-files" });
    });

    it("returns noGit when there is no .git directory (hasRepository returns false)", () => {
      makeWorkspace(gateway);
      writeIntent(gateway, "auth");
      writeDocsUpdateRules(gateway);
      mockGit.hasRepository = () => false;

      const result = useCase.getAffectedDocs("auth");
      expect(result).toEqual({ kind: "no-git" });
    });

    it("returns noAffectedDocs when manifest has no entries with scope", () => {
      makeWorkspace(gateway);
      writeIntent(gateway, "auth");
      writeDocsUpdateRules(gateway);
      mockGit.getChangedFiles = () => ["src/some-file.ts"];

      const manifest = {
        version: "1.0",
        documents: {
          "api-reference": {
            path: ".codeforge/docs/api-reference.md",
            intents: [PATHS.intentFile("auth")],
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

    it("returns intentNotFound when the intent file does not exist", () => {
      makeWorkspace(gateway);
      const result = useCase.getManualDoc("missing-intent", "api-reference");
      expect(result).toEqual({ kind: "intent-not-found" });
    });

    it("continues when docs-update.md rules are missing", () => {
      makeWorkspace(gateway);
      writeIntent(gateway, "auth");
      const result = useCase.getManualDoc("auth", "api-reference");
      expect(result).toEqual({ kind: "doc-not-found" });
    });

    it("returns docNotFound when doc is absent from manifest and disk", () => {
      makeWorkspace(gateway);
      writeIntent(gateway, "auth");
      writeDocsUpdateRules(gateway);

      const result = useCase.getManualDoc("auth", "non-existent-doc");
      expect(result).toEqual({ kind: "doc-not-found" });
    });

    it("succeeds when the doc is registered in manifest.json", () => {
      makeWorkspace(gateway);
      writeIntent(gateway, "auth");
      writeDocsUpdateRules(gateway);

      const manifest = {
        version: "1.0",
        documents: {
          "api-reference": {
            path: ".codeforge/docs/api-reference.md",
            intents: [PATHS.intentFile("auth")],
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

  describe("execute without rules", () => {
    it.each(["missing", "empty"]) ("runs a manual update when rules are %s", async (rulesState) => {
      makeWorkspace(gateway);
      const doc = { docName: "api", docPath: ".codeforge/docs/api.md", intentPaths: [], matchedFiles: [] };
      if (rulesState === "empty") writeDocsUpdateRules(gateway, "  \n");
      mockRunner.execute = vi.fn().mockResolvedValue(undefined) as any;

      await useCase.execute("auth", doc, true);

      expect(mockRunner.execute).toHaveBeenCalledTimes(1);
    });
  });
});
