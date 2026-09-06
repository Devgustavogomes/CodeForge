import { describe, it, expect, beforeEach } from "vitest";
import {
  PullSpecUseCase,
  sanitizeFilename,
} from "../../src/application/use-cases/PullSpecUseCase.js";
import { SpecSource } from "../../src/application/ports/SpecSource.js";
import { FetchedSpec, SpecReference } from "../../src/domain/spec-source.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";

class MockSpecSource implements SpecSource {
  readonly name: string;
  public specs = new Map<string, FetchedSpec>();

  constructor(name = "mock-source") {
    this.name = name;
  }

  async list(): Promise<SpecReference[]> {
    return Array.from(this.specs.values()).map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
    }));
  }

  async fetch(id: string): Promise<FetchedSpec> {
    const spec = this.specs.get(id);
    if (!spec) {
      throw new Error(`Spec "${id}" not found on ${this.name}.`);
    }
    return spec;
  }
}

function initWorkspace(gw: InMemoryWorkspaceGateway): void {
  gw.mkdir(".codeforge");
  gw.mkdir(".codeforge/specs");
  gw.writeFile(
    ".codeforge/metadata.json",
    JSON.stringify({
      initialized: true,
      version: "1.0",
      initializedAt: new Date().toISOString(),
    })
  );
}

describe("PullSpecUseCase - Title-Based Naming and Fallbacks", () => {
  let gw: InMemoryWorkspaceGateway;
  let mockSource: MockSpecSource;
  let useCase: PullSpecUseCase;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    mockSource = new MockSpecSource("linear");
    useCase = new PullSpecUseCase(gw, mockSource);
    initWorkspace(gw);
  });

  it("names spec file using sanitized issue title by default", async () => {
    mockSource.specs.set("ENG-101", {
      id: "ENG-101",
      title: "Add User Authentication",
      description: "Implement OAuth2 and email/password login.",
      url: "https://linear.app/issue/ENG-101",
    });

    const result = await useCase.execute({ id: "ENG-101" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("add-user-authentication");
      expect(result.filePath).toBe(".codeforge/specs/add-user-authentication.md");
      expect(result.overwritten).toBe(false);
      expect(gw.exists(".codeforge/specs/add-user-authentication.md")).toBe(true);
      expect(gw.exists(".codeforge/specs/eng-101.md")).toBe(false);
    }
  });

  it("falls back to sanitized issue ID when issue title is empty", async () => {
    mockSource.specs.set("ENG-202", {
      id: "ENG-202",
      title: "",
      description: "Issue without a title.",
      url: "https://linear.app/issue/ENG-202",
    });

    const result = await useCase.execute({ id: "ENG-202" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("eng-202");
      expect(result.filePath).toBe(".codeforge/specs/eng-202.md");
      expect(gw.exists(".codeforge/specs/eng-202.md")).toBe(true);
    }
  });

  it("falls back to sanitized issue ID when title sanitizes to an empty string", async () => {
    mockSource.specs.set("ENG-303", {
      id: "ENG-303",
      title: "??? !!! @@@",
      description: "Issue with special symbols as title.",
      url: "https://linear.app/issue/ENG-303",
    });

    const result = await useCase.execute({ id: "ENG-303" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("eng-303");
      expect(result.filePath).toBe(".codeforge/specs/eng-303.md");
      expect(gw.exists(".codeforge/specs/eng-303.md")).toBe(true);
    }
  });

  it("falls back to 'spec' if both title and ID sanitize to empty string", async () => {
    mockSource.specs.set("???", {
      id: "???",
      title: "***",
      description: "Edge case with un-sanitizable strings.",
    });

    const result = await useCase.execute({ id: "???" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("spec");
      expect(result.filePath).toBe(".codeforge/specs/spec.md");
      expect(gw.exists(".codeforge/specs/spec.md")).toBe(true);
    }
  });

  it("respects explicit customName override over issue title", async () => {
    mockSource.specs.set("ENG-101", {
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
      expect(result.filePath).toBe(".codeforge/specs/custom-auth-flow.md");
      expect(gw.exists(".codeforge/specs/custom-auth-flow.md")).toBe(true);
      expect(gw.exists(".codeforge/specs/add-user-authentication.md")).toBe(false);
      expect(gw.exists(".codeforge/specs/eng-101.md")).toBe(false);
    }
  });

  it("sanitizes customName if it contains spaces and uppercase characters", async () => {
    mockSource.specs.set("ENG-101", {
      id: "ENG-101",
      title: "Add User Authentication",
      description: "Implement OAuth2.",
    });

    const result = await useCase.execute({
      id: "ENG-101",
      customName: "My Custom Spec Name!",
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("my-custom-spec-name");
      expect(result.filePath).toBe(".codeforge/specs/my-custom-spec-name.md");
      expect(gw.exists(".codeforge/specs/my-custom-spec-name.md")).toBe(true);
    }
  });

  it("detects overwrite correctly and formats Markdown content idempotently", async () => {
    mockSource.specs.set("ENG-101", {
      id: "ENG-101",
      title: "Add User Authentication",
      description: "Detailed spec description.",
      url: "https://linear.app/issue/ENG-101",
    });

    // Write existing content first
    gw.writeFile(
      ".codeforge/specs/add-user-authentication.md",
      "# Pre-existing spec content\n"
    );

    const result = await useCase.execute({ id: "ENG-101" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.overwritten).toBe(true);
      const content = gw.readFile(result.filePath);
      expect(content).not.toContain("Pre-existing spec content");
      expect(content).toBe(
        "# [ENG-101] Add User Authentication\n\n" +
          "> **Source:** linear | **URL:** https://linear.app/issue/ENG-101\n\n" +
          "## Description\n\n" +
          "Detailed spec description.\n"
      );
    }
  });
});
