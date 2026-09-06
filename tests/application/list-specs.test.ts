import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { ListSpecsUseCase, extractMarkdownTitle } from "../../src/application/use-cases/ListSpecsUseCase.js";

describe("ListSpecsUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let useCase: ListSpecsUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    useCase = new ListSpecsUseCase(gateway);
  });

  describe("empty specs directory behavior", () => {
    it("returns empty array if specs directory does not exist", () => {
      expect(useCase.execute()).toEqual([]);
      expect(useCase.listNames()).toEqual([]);
    });

    it("returns empty array if specs directory exists but has no files", () => {
      gateway.mkdir(".codeforge/specs");
      expect(useCase.execute()).toEqual([]);
    });

    it("ignores non-markdown files", () => {
      gateway.mkdir(".codeforge/specs");
      gateway.writeFile(".codeforge/specs/notes.txt", "some notes");
      gateway.writeFile(".codeforge/specs/data.json", "{}");
      gateway.writeFile(".codeforge/specs/image.png", "");

      expect(useCase.execute()).toEqual([]);
    });
  });

  describe("title extraction from markdown heading formats", () => {
    it("extracts title from standard # heading", () => {
      gateway.mkdir(".codeforge/specs");
      gateway.writeFile(".codeforge/specs/auth.md", "# User Authentication\n\nSpec details here.");

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0].title).toBe("User Authentication");
    });

    it("extracts title with extra whitespace", () => {
      gateway.mkdir(".codeforge/specs");
      gateway.writeFile(".codeforge/specs/spaced.md", "#    Spaced Title Heading   \n\nContent.");

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0].title).toBe("Spaced Title Heading");
    });

    it("extracts title with trailing hashes", () => {
      gateway.mkdir(".codeforge/specs");
      gateway.writeFile(".codeforge/specs/hashes.md", "# Heading With Trailing Hashes ###\n\nContent.");

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0].title).toBe("Heading With Trailing Hashes");
    });

    it("extracts title from level 2 or level 3 heading when level 1 is absent", () => {
      gateway.mkdir(".codeforge/specs");
      gateway.writeFile(".codeforge/specs/subheading.md", "## Secondary Heading\n\nContent.");

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0].title).toBe("Secondary Heading");
    });

    it("extracts title when preceded by frontmatter and blank lines", () => {
      gateway.mkdir(".codeforge/specs");
      const content = `---
title: Yaml metadata
author: dev
---

# Feature Title from Markdown

Feature description.`;
      gateway.writeFile(".codeforge/specs/frontmatter.md", content);

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0].title).toBe("Feature Title from Markdown");
    });

    it("falls back to spec name when markdown has no heading", () => {
      gateway.mkdir(".codeforge/specs");
      gateway.writeFile(".codeforge/specs/no-heading.md", "This is just text without any markdown heading.");

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0].title).toBe("no-heading");
    });

    it("falls back to spec name when file is empty", () => {
      gateway.mkdir(".codeforge/specs");
      gateway.writeFile(".codeforge/specs/empty-spec.md", "");

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0].title).toBe("empty-spec");
    });

    it("skips empty heading line and finds subsequent valid heading", () => {
      gateway.mkdir(".codeforge/specs");
      gateway.writeFile(".codeforge/specs/skip-empty.md", "#   \n# Valid Heading\n\nBody.");

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0].title).toBe("Valid Heading");
    });

    it("works via standalone extractMarkdownTitle helper", () => {
      expect(extractMarkdownTitle("# Direct Title", "fallback")).toBe("Direct Title");
      expect(extractMarkdownTitle("No heading", "fallback")).toBe("fallback");
      expect(extractMarkdownTitle("", "fallback")).toBe("fallback");
    });
  });

  describe("status resolution", () => {
    beforeEach(() => {
      gateway.mkdir(".codeforge/specs");
    });

    it("resolves to not_started when no tasks dir and no execution file exist", () => {
      gateway.writeFile(".codeforge/specs/login.md", "# Login Feature");

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0]).toEqual({
        name: "login",
        title: "Login Feature",
        status: "not_started",
      });
    });

    it("resolves to not_started when tasks dir exists but contains no json files", () => {
      gateway.writeFile(".codeforge/specs/login.md", "# Login Feature");
      gateway.mkdir(".codeforge/tasks/login");
      gateway.writeFile(".codeforge/tasks/login/notes.txt", "not a task");

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0].status).toBe("not_started");
    });

    it("resolves to planned when tasks dir contains task json files and no execution file exists", () => {
      gateway.writeFile(".codeforge/specs/login.md", "# Login Feature");
      gateway.mkdir(".codeforge/tasks/login");
      gateway.writeFile(".codeforge/tasks/login/TASK-001.json", JSON.stringify({ id: "TASK-001" }));

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0]).toEqual({
        name: "login",
        title: "Login Feature",
        status: "planned",
      });
    });

    it("resolves to in_progress when execution file has status 'running' or 'in_progress'", () => {
      gateway.writeFile(".codeforge/specs/login.md", "# Login Feature");
      gateway.mkdir(".codeforge/tasks/login");
      gateway.writeFile(".codeforge/tasks/login/TASK-001.json", JSON.stringify({ id: "TASK-001" }));
      gateway.mkdir(".codeforge/executions");
      gateway.writeFile(
        ".codeforge/executions/login.json",
        JSON.stringify({ specId: "login", status: "running" })
      );

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0].status).toBe("in_progress");
    });

    it("resolves to completed when execution file has status 'completed'", () => {
      gateway.writeFile(".codeforge/specs/login.md", "# Login Feature");
      gateway.mkdir(".codeforge/tasks/login");
      gateway.writeFile(".codeforge/tasks/login/TASK-001.json", JSON.stringify({ id: "TASK-001" }));
      gateway.mkdir(".codeforge/executions");
      gateway.writeFile(
        ".codeforge/executions/login.json",
        JSON.stringify({ specId: "login", status: "completed" })
      );

      const specs = useCase.execute();
      expect(specs).toHaveLength(1);
      expect(specs[0]).toEqual({
        name: "login",
        title: "Login Feature",
        status: "completed",
      });
    });

    it("handles multiple specs with mixed statuses sorted alphabetically by name", () => {
      // 1. completed
      gateway.writeFile(".codeforge/specs/c-feature.md", "# C Feature Title");
      gateway.mkdir(".codeforge/tasks/c-feature");
      gateway.writeFile(".codeforge/tasks/c-feature/TASK-1.json", "{}");
      gateway.mkdir(".codeforge/executions");
      gateway.writeFile(
        ".codeforge/executions/c-feature.json",
        JSON.stringify({ specId: "c-feature", status: "completed" })
      );

      // 2. planned
      gateway.writeFile(".codeforge/specs/b-feature.md", "# B Feature Title");
      gateway.mkdir(".codeforge/tasks/b-feature");
      gateway.writeFile(".codeforge/tasks/b-feature/TASK-1.json", "{}");

      // 3. not started
      gateway.writeFile(".codeforge/specs/a-feature.md", "# A Feature Title");

      // 4. in progress
      gateway.writeFile(".codeforge/specs/d-feature.md", "# D Feature Title");
      gateway.mkdir(".codeforge/executions");
      gateway.writeFile(
        ".codeforge/executions/d-feature.json",
        JSON.stringify({ specId: "d-feature", status: "running" })
      );

      const specs = useCase.execute();
      expect(specs).toHaveLength(4);
      expect(specs.map((s) => s.name)).toEqual(["a-feature", "b-feature", "c-feature", "d-feature"]);
      expect(specs.map((s) => s.status)).toEqual(["not_started", "planned", "completed", "in_progress"]);
      expect(useCase.listNames()).toEqual(["a-feature", "b-feature", "c-feature", "d-feature"]);
    });
  });
});
