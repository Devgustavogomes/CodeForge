import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { ListIntentsUseCase, extractMarkdownTitle } from "../../src/application/use-cases/ListIntentsUseCase.js";

describe("ListIntentsUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let useCase: ListIntentsUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    useCase = new ListIntentsUseCase(gateway);
  });

  describe("empty intents directory behavior", () => {
    it("returns empty array if intents directory does not exist", () => {
      expect(useCase.execute()).toEqual([]);
      expect(useCase.listNames()).toEqual([]);
    });

    it("returns empty array if intents directory exists but has no files", () => {
      gateway.mkdir(".codeforge/intents");
      expect(useCase.execute()).toEqual([]);
    });

    it("ignores non-markdown files", () => {
      gateway.mkdir(".codeforge/intents");
      gateway.writeFile(".codeforge/intents/notes.txt", "some notes");
      gateway.writeFile(".codeforge/intents/data.json", "{}");
      gateway.writeFile(".codeforge/intents/image.png", "");

      expect(useCase.execute()).toEqual([]);
    });
  });

  describe("title extraction from markdown heading formats", () => {
    it("extracts title from standard # heading", () => {
      gateway.mkdir(".codeforge/intents");
      gateway.writeFile(".codeforge/intents/auth.md", "# User Authentication\n\nIntent details here.");

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0].title).toBe("User Authentication");
    });

    it("extracts title with extra whitespace", () => {
      gateway.mkdir(".codeforge/intents");
      gateway.writeFile(".codeforge/intents/spaced.md", "#    Spaced Title Heading   \n\nContent.");

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0].title).toBe("Spaced Title Heading");
    });

    it("extracts title with trailing hashes", () => {
      gateway.mkdir(".codeforge/intents");
      gateway.writeFile(".codeforge/intents/hashes.md", "# Heading With Trailing Hashes ###\n\nContent.");

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0].title).toBe("Heading With Trailing Hashes");
    });

    it("extracts title from level 2 or level 3 heading when level 1 is absent", () => {
      gateway.mkdir(".codeforge/intents");
      gateway.writeFile(".codeforge/intents/subheading.md", "## Secondary Heading\n\nContent.");

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0].title).toBe("Secondary Heading");
    });

    it("extracts title when preceded by frontmatter and blank lines", () => {
      gateway.mkdir(".codeforge/intents");
      const content = `---
title: Yaml metadata
author: dev
---

# Feature Title from Markdown

Feature description.`;
      gateway.writeFile(".codeforge/intents/frontmatter.md", content);

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0].title).toBe("Feature Title from Markdown");
    });

    it("falls back to intent name when markdown has no heading", () => {
      gateway.mkdir(".codeforge/intents");
      gateway.writeFile(".codeforge/intents/no-heading.md", "This is just text without any markdown heading.");

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0].title).toBe("no-heading");
    });

    it("falls back to intent name when file is empty", () => {
      gateway.mkdir(".codeforge/intents");
      gateway.writeFile(".codeforge/intents/empty-intent.md", "");

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0].title).toBe("empty-intent");
    });

    it("skips empty heading line and finds subsequent valid heading", () => {
      gateway.mkdir(".codeforge/intents");
      gateway.writeFile(".codeforge/intents/skip-empty.md", "#   \n# Valid Heading\n\nBody.");

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0].title).toBe("Valid Heading");
    });

    it("works via standalone extractMarkdownTitle helper", () => {
      expect(extractMarkdownTitle("# Direct Title", "fallback")).toBe("Direct Title");
      expect(extractMarkdownTitle("No heading", "fallback")).toBe("fallback");
      expect(extractMarkdownTitle("", "fallback")).toBe("fallback");
    });
  });

  describe("status resolution", () => {
    beforeEach(() => {
      gateway.mkdir(".codeforge/intents");
    });

    it("resolves to not_started when no tasks dir and no execution file exist", () => {
      gateway.writeFile(".codeforge/intents/login.md", "# Login Feature");

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0]).toEqual({
        name: "login",
        title: "Login Feature",
        status: "not_started",
      });
    });

    it("resolves to not_started when tasks dir exists but contains no json files", () => {
      gateway.writeFile(".codeforge/intents/login.md", "# Login Feature");
      gateway.mkdir(".codeforge/tasks/login");
      gateway.writeFile(".codeforge/tasks/login/notes.txt", "not a task");

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0].status).toBe("not_started");
    });

    it("resolves to planned when tasks dir contains task json files and no execution file exists", () => {
      gateway.writeFile(".codeforge/intents/login.md", "# Login Feature");
      gateway.mkdir(".codeforge/tasks/login");
      gateway.writeFile(".codeforge/tasks/login/TASK-001.json", JSON.stringify({ id: "TASK-001" }));

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0]).toEqual({
        name: "login",
        title: "Login Feature",
        status: "planned",
      });
    });

    it("resolves to in_progress when execution file has status 'running' or 'in_progress'", () => {
      gateway.writeFile(".codeforge/intents/login.md", "# Login Feature");
      gateway.mkdir(".codeforge/tasks/login");
      gateway.writeFile(".codeforge/tasks/login/TASK-001.json", JSON.stringify({ id: "TASK-001" }));
      gateway.mkdir(".codeforge/executions");
      gateway.writeFile(
        ".codeforge/executions/login.json",
        JSON.stringify({ intentId: "login", status: "running" })
      );

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0].status).toBe("in_progress");
    });

    it("resolves to completed when execution file has status 'completed'", () => {
      gateway.writeFile(".codeforge/intents/login.md", "# Login Feature");
      gateway.mkdir(".codeforge/tasks/login");
      gateway.writeFile(".codeforge/tasks/login/TASK-001.json", JSON.stringify({ id: "TASK-001" }));
      gateway.mkdir(".codeforge/executions");
      gateway.writeFile(
        ".codeforge/executions/login.json",
        JSON.stringify({ intentId: "login", status: "completed" })
      );

      const intents = useCase.execute();
      expect(intents).toHaveLength(1);
      expect(intents[0]).toEqual({
        name: "login",
        title: "Login Feature",
        status: "completed",
      });
    });

    it("handles multiple intents with mixed statuses sorted alphabetically by name", () => {
      // 1. completed
      gateway.writeFile(".codeforge/intents/c-feature.md", "# C Feature Title");
      gateway.mkdir(".codeforge/tasks/c-feature");
      gateway.writeFile(".codeforge/tasks/c-feature/TASK-1.json", "{}");
      gateway.mkdir(".codeforge/executions");
      gateway.writeFile(
        ".codeforge/executions/c-feature.json",
        JSON.stringify({ intentId: "c-feature", status: "completed" })
      );

      // 2. planned
      gateway.writeFile(".codeforge/intents/b-feature.md", "# B Feature Title");
      gateway.mkdir(".codeforge/tasks/b-feature");
      gateway.writeFile(".codeforge/tasks/b-feature/TASK-1.json", "{}");

      // 3. not started
      gateway.writeFile(".codeforge/intents/a-feature.md", "# A Feature Title");

      // 4. in progress
      gateway.writeFile(".codeforge/intents/d-feature.md", "# D Feature Title");
      gateway.mkdir(".codeforge/executions");
      gateway.writeFile(
        ".codeforge/executions/d-feature.json",
        JSON.stringify({ intentId: "d-feature", status: "running" })
      );

      const intents = useCase.execute();
      expect(intents).toHaveLength(4);
      expect(intents.map((s) => s.name)).toEqual(["a-feature", "b-feature", "c-feature", "d-feature"]);
      expect(intents.map((s) => s.status)).toEqual(["not_started", "planned", "completed", "in_progress"]);
      expect(useCase.listNames()).toEqual(["a-feature", "b-feature", "c-feature", "d-feature"]);
    });
  });
});
