import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { CreateIntentUseCase } from "../../src/application/use-cases/CreateIntentUseCase.js";

function makeInitializedWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/intents");
  gateway.writeFile(
    ".codeforge/metadata.json",
    JSON.stringify({ initialized: true, version: "1.0", initializedAt: new Date().toISOString() })
  );
}

describe("CreateIntentUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let useCase: CreateIntentUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    useCase = new CreateIntentUseCase(gateway);
  });

  it("returns notInitialized: true when .codeforge/metadata.json is missing", () => {
    const result = useCase.execute("User Authentication");
    expect(result.kind).toBe("not-initialized");
  });

  it("creates the intent file successfully", () => {
    makeInitializedWorkspace(gateway);

    const result = useCase.execute("User Authentication");

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(gateway.exists(result.filePath)).toBe(true);
    }
  });

  it("returns alreadyExists: true when intent already exists", () => {
    makeInitializedWorkspace(gateway);
    useCase.execute("User Authentication");

    const result = useCase.execute("User Authentication");

    expect(result.kind).toBe("already-exists");
  });

  it("does not overwrite existing intent file", () => {
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
