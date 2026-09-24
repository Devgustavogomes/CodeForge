import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { InitializeWorkspaceUseCase } from "../../src/application/use-cases/InitializeWorkspaceUseCase.js";

describe("InitializeWorkspaceUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let useCase: InitializeWorkspaceUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    useCase = new InitializeWorkspaceUseCase(gateway);
  });

  it("creates all expected subdirectories", () => {
    useCase.execute();

    const subdirs = ["intents", "tasks", "executions", "rules", "docs"];
    for (const sub of subdirs) {
      expect(gateway.exists(`.codeforge/${sub}`)).toBe(true);
    }

  });

  it("creates config.yaml if not provided", () => {
    useCase.execute();
    expect(gateway.exists(".codeforge/config.yaml")).toBe(true);
  });

  it("creates the expected project guidance rule files", () => {
    useCase.execute();
    const paths = [
      ".codeforge/rules/planning.md",
      ".codeforge/rules/running.md",
      ".codeforge/rules/review.md",
      ".codeforge/rules/docs.md",
      ".codeforge/rules/docs-update.md",
    ];
    for (const path of paths) {
      expect(gateway.exists(path)).toBe(true);
    }
  });

  it("preserves existing customized rules during incomplete initialization", () => {
    gateway.mkdir(".codeforge");
    gateway.mkdir(".codeforge/rules");
    gateway.writeFile(".codeforge/rules/planning.md", "My planning rules\n");

    useCase.execute();

    expect(gateway.readFile(".codeforge/rules/planning.md")).toBe("My planning rules\n");
    expect(gateway.exists(".codeforge/rules/running.md")).toBe(true);
  });

  it("creates metadata.json with initialized: true", () => {
    useCase.execute();
    expect(gateway.exists(".codeforge/metadata.json")).toBe(true);

    const metadata = JSON.parse(gateway.readFile(".codeforge/metadata.json"));
    expect(metadata.initialized).toBe(true);
    expect(metadata.version).toBe("1.0");
    expect(typeof metadata.initializedAt).toBe("string");
  });

  it("returns the list of created entries", () => {
    const result = useCase.execute();

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.created).toEqual([
        ".codeforge/",
        ".codeforge/config.yaml",
        ".codeforge/intents/",
        ".codeforge/tasks/",
        ".codeforge/executions/",
        ".codeforge/rules/",
        ".codeforge/docs/",
        ".codeforge/rules/planning.md",
        ".codeforge/rules/running.md",
        ".codeforge/rules/docs.md",
        ".codeforge/rules/docs-update.md",
        ".codeforge/rules/review.md",
        ".codeforge/docs/manifest.json",
        ".codeforge/metadata.json",
      ]);
    }
  });

  it("returns alreadyInitialized: true on second run", () => {
    useCase.execute();
    const result = useCase.execute();

    expect(result.kind).toBe("already-initialized");
  });

  it("does not overwrite existing files on second run", () => {
    useCase.execute();

    gateway.writeFile(".codeforge/config.yaml", "# modified by user\n");

    useCase.execute();

    const contentAfter = gateway.readFile(".codeforge/config.yaml");
    expect(contentAfter).toBe("# modified by user\n");
  });

  it("metadata.json is written last (atomicity signal)", () => {
    gateway.mkdir(".codeforge");
    gateway.writeFile(".codeforge/config.yaml", "# partial\n");

    const result = useCase.execute();
    expect(result.kind).toBe("created");

    expect(gateway.exists(".codeforge/metadata.json")).toBe(true);
  });
});
