import { describe, it, expect, beforeEach } from "vitest";
import { PullIntentUseCase } from "../../src/application/use-cases/PullIntentUseCase.js";
import { IntentSource } from "../../src/application/ports/IntentSource.js";
import { FetchedIntent, IntentReference } from "../../src/domain/intent-source.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { WorkspaceBuilder } from "../helpers/workspace-builder.js";

class MockIntentSource implements IntentSource {
  readonly name: string;
  public intents = new Map<string, FetchedIntent>();

  constructor(name = "mock-source") {
    this.name = name;
  }

  async list(): Promise<IntentReference[]> {
    return Array.from(this.intents.values()).map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
    }));
  }

  async fetch(id: string): Promise<FetchedIntent> {
    const intent = this.intents.get(id);
    if (!intent) {
      throw new Error(`Intent "${id}" not found on ${this.name}.`);
    }
    return intent;
  }
}

describe("PullIntentUseCase - Title-Based Naming and Fallbacks", () => {
  let gw: InMemoryWorkspaceGateway;
  let mockSource: MockIntentSource;
  let useCase: PullIntentUseCase;

  beforeEach(() => {
    gw = WorkspaceBuilder.aWorkspace().withMetadata().build();
    mockSource = new MockIntentSource("linear");
    useCase = new PullIntentUseCase(gw, mockSource);
  });

  it("names intent file using sanitized issue title by default", async () => {
    mockSource.intents.set("ENG-101", {
      id: "ENG-101",
      title: "Add User Authentication",
      description: "Implement OAuth2 and email/password login.",
      url: "https://linear.app/issue/ENG-101",
    });

    const result = await useCase.execute({ id: "ENG-101" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("add-user-authentication");
      expect(result.filePath).toBe(".codeforge/intents/add-user-authentication.md");
      expect(result.overwritten).toBe(false);
      expect(gw.exists(".codeforge/intents/add-user-authentication.md")).toBe(true);
      expect(gw.exists(".codeforge/intents/eng-101.md")).toBe(false);
    }
  });

  it("falls back to sanitized issue ID when issue title is empty", async () => {
    mockSource.intents.set("ENG-202", {
      id: "ENG-202",
      title: "",
      description: "Issue without a title.",
      url: "https://linear.app/issue/ENG-202",
    });

    const result = await useCase.execute({ id: "ENG-202" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("eng-202");
      expect(result.filePath).toBe(".codeforge/intents/eng-202.md");
      expect(gw.exists(".codeforge/intents/eng-202.md")).toBe(true);
    }
  });

  it("falls back to sanitized issue ID when title sanitizes to an empty string", async () => {
    mockSource.intents.set("ENG-303", {
      id: "ENG-303",
      title: "??? !!! @@@",
      description: "Issue with special symbols as title.",
      url: "https://linear.app/issue/ENG-303",
    });

    const result = await useCase.execute({ id: "ENG-303" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("eng-303");
      expect(result.filePath).toBe(".codeforge/intents/eng-303.md");
      expect(gw.exists(".codeforge/intents/eng-303.md")).toBe(true);
    }
  });

  it("falls back to 'intent' if both title and ID sanitize to empty string", async () => {
    mockSource.intents.set("???", {
      id: "???",
      title: "***",
      description: "Edge case with un-sanitizable strings.",
    });

    const result = await useCase.execute({ id: "???" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("intent");
      expect(result.filePath).toBe(".codeforge/intents/intent.md");
      expect(gw.exists(".codeforge/intents/intent.md")).toBe(true);
    }
  });

  it("respects explicit customName override over issue title", async () => {
    mockSource.intents.set("ENG-101", {
      id: "ENG-101",
      title: "Add User Authentication",
      description: "Implement OAuth2 and email/password login.",
      url: "https://linear.app/issue/ENG-101",
    });

    const result = await useCase.execute({
      id: "ENG-101",
      customName: "custom-auth-flow",
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("custom-auth-flow");
      expect(result.filePath).toBe(".codeforge/intents/custom-auth-flow.md");
      expect(gw.exists(".codeforge/intents/custom-auth-flow.md")).toBe(true);
      expect(gw.exists(".codeforge/intents/add-user-authentication.md")).toBe(false);
      expect(gw.exists(".codeforge/intents/eng-101.md")).toBe(false);
    }
  });

  it("sanitizes customName if it contains spaces and uppercase characters", async () => {
    mockSource.intents.set("ENG-101", {
      id: "ENG-101",
      title: "Add User Authentication",
      description: "Implement OAuth2.",
    });

    const result = await useCase.execute({
      id: "ENG-101",
      customName: "My Custom Intent Name!",
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("my-custom-intent-name");
      expect(result.filePath).toBe(".codeforge/intents/my-custom-intent-name.md");
      expect(gw.exists(".codeforge/intents/my-custom-intent-name.md")).toBe(true);
    }
  });

  it("detects overwrite correctly and formats Markdown content idempotently", async () => {
    mockSource.intents.set("ENG-101", {
      id: "ENG-101",
      title: "Add User Authentication",
      description: "Detailed intent description.",
      url: "https://linear.app/issue/ENG-101",
    });

    // Write existing content first
    gw.writeFile(
      ".codeforge/intents/add-user-authentication.md",
      "# Pre-existing intent content\n"
    );

    const result = await useCase.execute({ id: "ENG-101" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.overwritten).toBe(true);
      const content = gw.readFile(result.filePath);
      expect(content).toBe(
        "# [ENG-101] Add User Authentication\n\n" +
          "> **Source:** linear | **URL:** https://linear.app/issue/ENG-101\n\n" +
          "## Description\n\n" +
          "Detailed intent description.\n"
      );
    }
  });
});
