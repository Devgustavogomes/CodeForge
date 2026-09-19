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

  it("creates all expected subdirectories (no plans/)", () => {
    useCase.execute();

    const subdirs = ["intents", "tasks", "executions", "rules", "docs"];
    for (const sub of subdirs) {
      expect(gateway.exists(`.codeforge/${sub}`)).toBe(true);
    }

    expect(gateway.exists(".codeforge/plans")).toBe(false);
  });

  it("creates config.yaml with default structure if not provided", () => {
    useCase.execute();
    expect(gateway.exists(".codeforge/config.yaml")).toBe(true);
    const content = gateway.readFile(".codeforge/config.yaml");
    expect(content).toContain('version: "1.0"');
  });

  it("creates rules/planning.md from embedded ts constant", () => {
    useCase.execute();
    expect(gateway.exists(".codeforge/rules/planning.md")).toBe(true);
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
      expect(result.created).toContain(".codeforge/");
      expect(result.created).toContain(".codeforge/config.yaml");
      expect(result.created).toContain(".codeforge/rules/planning.md");
      expect(result.created).toContain(".codeforge/metadata.json");

      const subdirs = ["intents", "tasks", "executions", "rules", "docs"];
      for (const sub of subdirs) {
        expect(result.created).toContain(`.codeforge/${sub}/`);
      }

      expect(result.created).not.toContain(".codeforge/plans/");
    }
  });

  it("returns alreadyInitialized: true on second run", () => {
    useCase.execute();
    const result = useCase.execute();

    expect(result.kind).toBe("already-initialized");
  });

  it("does not overwrite existing files on second run", () => {
    useCase.execute();

    const originalContent = gateway.readFile(".codeforge/config.yaml");
    gateway.writeFile(".codeforge/config.yaml", "# modified by user\n");

    useCase.execute();

    const contentAfter = gateway.readFile(".codeforge/config.yaml");
    expect(contentAfter).toBe("# modified by user\n");
    expect(contentAfter).not.toBe(originalContent);
  });

  it("metadata.json is written last (atomicity signal)", () => {
    gateway.mkdir(".codeforge");
    gateway.writeFile(".codeforge/config.yaml", "# partial\n");

    const result = useCase.execute();
    expect(result.kind).toBe("created");

    expect(gateway.exists(".codeforge/metadata.json")).toBe(true);
  });
});
