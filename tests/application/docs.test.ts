import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CreateDocUseCase } from "../../src/application/use-cases/CreateDocUseCase.js";
import { UpdateDocUseCase } from "../../src/application/use-cases/UpdateDocUseCase.js";
import {
  buildDocsCreatePrompt,
  buildDocsUpdatePrompt,
  buildDocsManualUpdatePrompt,
} from "../../src/infrastructure/assets/prompts/docs.js";
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

  it("creates documentation when the optional docs rules file is missing", async () => {
    makeWorkspace(gateway);
    writeIntent(gateway, "auth");
    let prompt = "";
    vi.mocked(runner.execute).mockImplementation(async (context) => {
      prompt = gateway.readFile(context.promptFilePath);
      return undefined as any;
    });
    const result = await useCase.execute("my-doc", "auth");
    expect(result).toEqual({ kind: "success" });
    for (const heading of ["## Overview", "## Data Model", "## API Reference", "## Error Handling", "## Design Decisions"]) {
      expect(prompt).toContain(heading);
    }
    expect(prompt).toContain("state briefly and factually");
    expect(prompt).not.toContain("PROJECT DOCUMENTATION RULES");
  });

  it("omits the project rules section when the docs rules file is empty", async () => {
    makeWorkspace(gateway);
    writeIntent(gateway, "auth");
    writeDocsRules(gateway, "  \n");
    let prompt = "";
    vi.mocked(runner.execute).mockImplementation(async (context) => {
      prompt = gateway.readFile(context.promptFilePath);
      return undefined as any;
    });

    await useCase.execute("my-doc", "auth");

    for (const heading of ["## Overview", "## Data Model", "## API Reference", "## Error Handling", "## Design Decisions"]) {
      expect(prompt).toContain(heading);
    }
    expect(prompt).toContain("state briefly and factually");
    expect(prompt).not.toContain("PROJECT DOCUMENTATION RULES");
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
    expect(manifest.documents["my-doc"].intents).toContain(
      PATHS.intentFile("auth"),
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

describe("buildDocsCreatePrompt", () => {
  it("returns a prompt containing intent and rules content", () => {
    const prompt = buildDocsCreatePrompt("my-doc", "MY DOCS RULES", "MY INTENT CONTENT", "en");

    expect(prompt).toContain("MY INTENT CONTENT");
    expect(prompt).toContain("MY DOCS RULES");
    expect(prompt).toContain("my-doc");
  });

  it("keeps required sections and manifest scope contract with empty rules", () => {
    const prompt = buildDocsCreatePrompt("api", "", "INTENT", "pt-BR");
    const headings = ["## Overview", "## Data Model", "## API Reference", "## Error Handling", "## Design Decisions"];
    const headingPositions = headings.map((heading) => prompt.indexOf(heading));

    expect(headingPositions.every((position) => position >= 0)).toBe(true);
    expect(headingPositions).toEqual([...headingPositions].sort((a, b) => a - b));
    expect(prompt).toContain("all five");
    expect(prompt).toContain("even when its section has no applicable content");
    expect(prompt).toContain("state briefly and factually");
    expect(prompt).toContain("do not invent data models, APIs, errors, or design rationale");
    expect(prompt).toContain("cannot change the required headings or their order");
    expect(prompt).toContain("scope array");
    expect(prompt).toContain("Write generated prose in pt-BR; preserve JSON keys and technical code terms.");
    expect(prompt).not.toContain("PROJECT DOCUMENTATION RULES");
  });

  it("keeps the required section contract when project rules are missing", () => {
    const prompt = buildDocsCreatePrompt("api", "", "INTENT", "en");

    expect(prompt).toContain("all five of these sections");
    expect(prompt).toContain("state briefly and factually that the section does not apply");
    expect(prompt).not.toContain("Use only sections and details relevant");
    expect(prompt).not.toContain("PROJECT DOCUMENTATION RULES");
  });
});

describe("documentation update prompts", () => {
  const doc = { docName: "api", docPath: ".codeforge/docs/api.md", intentPaths: [], matchedFiles: [] };

  it("keeps semantic check and manifest contract in automatic updates", () => {
    const prompt = buildDocsUpdatePrompt(doc, "", "diff", ".codeforge/intents/auth.md", "en");
    expect(prompt).toContain("semantically affect");
    expect(prompt).toContain("exactly NO_UPDATE_NEEDED");
    expect(prompt).toContain("updatedAt");
    expect(prompt).toContain("intents");
    expect(prompt).toContain("scope");
    expect(prompt).not.toContain("PROJECT DOCUMENTATION RULES");
  });

  it("keeps semantic check and manifest contract in manual updates", () => {
    const prompt = buildDocsManualUpdatePrompt(doc, "CUSTOM STYLE", "auth", "en");
    expect(prompt).toContain("exactly NO_UPDATE_NEEDED");
    expect(prompt).toContain(".codeforge/intents/auth.md");
    expect(prompt).toContain("updatedAt");
    expect(prompt).toContain("PROJECT DOCUMENTATION RULES");
    expect(prompt).toContain("CUSTOM STYLE");
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
      let prompt = "";
      mockRunner.execute = vi.fn(async (context: any) => {
        prompt = gateway.readFile(context.promptFilePath);
        return undefined;
      }) as any;

      await useCase.execute("auth", doc, true);

      expect(prompt).toContain("NO_UPDATE_NEEDED");
      expect(prompt).not.toContain("PROJECT DOCUMENTATION RULES");
    });
  });
});
