import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { CreateSpecUseCase } from "../../src/application/use-cases/CreateSpecUseCase.js";

function makeInitializedWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/specs");
  gateway.writeFile(
    ".codeforge/metadata.json",
    JSON.stringify({ initialized: true, version: "1.0", initializedAt: new Date().toISOString() })
  );
}

describe("CreateSpecUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let useCase: CreateSpecUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    useCase = new CreateSpecUseCase(gateway);
  });

  it("returns notInitialized: true when .codeforge/metadata.json is missing", () => {
    const result = useCase.execute("User Authentication");
    expect(result.kind).toBe("not-initialized");
  });

  it("creates the spec file successfully with expected template", () => {
    makeInitializedWorkspace(gateway);

    const result = useCase.execute("User Authentication");

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(gateway.exists(result.filePath)).toBe(true);
      
      const content = gateway.readFile(result.filePath);
      expect(content).toContain("# User Authentication");
      expect(content).toContain("## Objective");
      expect(content).toContain("## Functional Requirements");
    }
  });

  it("returns alreadyExists: true when spec already exists", () => {
    makeInitializedWorkspace(gateway);
    useCase.execute("User Authentication");

    const result = useCase.execute("User Authentication");

    expect(result.kind).toBe("already-exists");
  });

  it("does not overwrite existing spec file", () => {
    makeInitializedWorkspace(gateway);
    const resultFirst = useCase.execute("User Authentication");
    
    if (resultFirst.kind === "created") {
      gateway.writeFile(resultFirst.filePath, "# my custom content\n");
    }

    useCase.execute("User Authentication");

    if (resultFirst.kind === "created") {
      const contentAfter = gateway.readFile(resultFirst.filePath);
      expect(contentAfter).toBe("# my custom content\n");
    }
  });
});
