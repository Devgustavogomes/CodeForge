import { describe, it, expect, beforeEach } from "vitest";
import { PromptService } from "../../../src/application/services/PromptService.js";
import { InMemoryWorkspaceGateway } from "../../helpers/in-memory-workspace.js";
import { Task } from "../../../src/domain/task.js";
import { PATHS } from "../../../src/infrastructure/paths.js";

describe("PromptService", () => {
  let gw: InMemoryWorkspaceGateway;
  let service: PromptService;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    service = new PromptService(gw);
    gw.mkdir(".codeforge");
    gw.mkdir(".codeforge/intents");
  });

  it("should create and return prompt file path", () => {
    const intentName = "test-intent";
    const task: Task = {
      id: "TASK-1",
      title: "Title",
      objective: "O",
      context: "C",
      implementation: "I",
      files: [],
      dependencies: [],
      constraints: [],
      acceptanceCriteria: []
    };

    const path = service.createPromptFile(intentName, task, "typescript");
    
    expect(path).toBe(`${PATHS.executionsDir}/${intentName}/${task.id}.temp.prompt.md`);
    expect(gw.exists(path)).toBe(true);
    
    const content = gw.readFile(path);
    expect(content).toContain(task.title);
  });

  it("should delete prompt file and empty parent directory", () => {
    const intentName = "test-intent";
    const dir = `${PATHS.executionsDir}/${intentName}`;
    const path = `${dir}/TASK-1.temp.prompt.md`;
    gw.mkdir(dir);
    gw.writeFile(path, "content");
    expect(gw.exists(path)).toBe(true);
    expect(gw.exists(dir)).toBe(true);

    service.deletePromptFile(path);
    expect(gw.exists(path)).toBe(false);
    expect(gw.exists(dir)).toBe(false);
  });

  it("should not delete parent directory if other prompt files remain", () => {
    const intentName = "test-intent";
    const dir = `${PATHS.executionsDir}/${intentName}`;
    const path1 = `${dir}/TASK-1.temp.prompt.md`;
    const path2 = `${dir}/TASK-2.temp.prompt.md`;
    gw.mkdir(dir);
    gw.writeFile(path1, "content 1");
    gw.writeFile(path2, "content 2");

    service.deletePromptFile(path1);
    expect(gw.exists(path1)).toBe(false);
    expect(gw.exists(dir)).toBe(true);

    service.deletePromptFile(path2);
    expect(gw.exists(path2)).toBe(false);
    expect(gw.exists(dir)).toBe(false);
  });

  it("should delete entire prompt directory with deletePromptDir", () => {
    const intentName = "test-intent";
    const dir = `${PATHS.executionsDir}/${intentName}`;
    gw.mkdir(dir);
    gw.writeFile(`${dir}/TASK-1.temp.prompt.md`, "content");
    expect(gw.exists(dir)).toBe(true);

    service.deletePromptDir(intentName);
    expect(gw.exists(dir)).toBe(false);
  });

  it("builds prompt with a lean intent reference and task fields", () => {
    gw.writeFile(".codeforge/intents/auth.md", "My Intent Content");

    const task: Task = {
      id: "TASK-001",
      title: "Login",
      objective: "Do login",
      context: "User logs in",
      implementation: "Write code",
      files: [],
      dependencies: [],
      constraints: ["No external APIs"],
      acceptanceCriteria: ["Must work"]
    };

    const path = service.createPromptFile("auth", task, "pt-BR");
    const prompt = gw.readFile(path);
    expect(prompt).toContain("CodeForge task execution | TASK-001: Login");
    expect(prompt).toContain("Intent: auth (.codeforge/intents/auth.md)");
    expect(prompt).toContain("Objective: Do login");
    expect(prompt).toContain("Target files:\nNo specific files provided in context.");
    expect(prompt).not.toContain("My Intent Content");
    expect(prompt).toContain("Constraints:\n- No external APIs");
  });

  it("injects real file contents if task specifies files", () => {
    gw.writeFile(".codeforge/intents/auth.md", "Intent");

    // Create a real source file in the workspace
    gw.mkdir("src");
    gw.writeFile("src/index.ts", "console.log('hello');");

    const task: Task = {
      id: "TASK-002",
      title: "Update Index",
      objective: "Add hi",
      context: "Context",
      implementation: "Write code",
      files: ["src/index.ts", "src/missing.ts"],
      dependencies: [],
      constraints: [],
      acceptanceCriteria: []
    };

    const path = service.createPromptFile("auth", task, "pt-BR");
    const prompt = gw.readFile(path);

    // It should include the existing file path
    expect(prompt).toContain("### File: src/index.ts");

    // It should note the missing file
    expect(prompt).toContain("### File: src/missing.ts");
    expect(prompt).toContain("(File does not exist yet. You will need to create it.)");
  });

  it("selects buildRetryPrompt and includes error section when previousErrors is provided with items", () => {
    gw.writeFile(".codeforge/intents/auth.md", "Intent content");

    const task: Task = {
      id: "TASK-003",
      title: "Retry Task",
      objective: "Fix bugs",
      context: "Previous run failed",
      implementation: "Fix code",
      files: [],
      dependencies: [],
      constraints: [],
      acceptanceCriteria: ["All tests must pass"],
    };

    const errors = [
      "Error: Command failed with exit code 1",
      "TS2304: Cannot find name 'x'",
    ];

    const path = service.createPromptFile("auth", task, "pt-BR", errors);
    const prompt = gw.readFile(path);

    expect(prompt).toContain("CodeForge task retry | TASK-003: Retry Task");
    expect(prompt).toContain("Intent: auth (.codeforge/intents/auth.md)");
    expect(prompt).toContain("--- PREVIOUS ATTEMPT FAILURE & ERRORS ---");
    expect(prompt).toContain("- Error: Command failed with exit code 1");
    expect(prompt).toContain("- TS2304: Cannot find name 'x'");
    expect(prompt).toContain("Objective: Fix bugs");
    expect(prompt).toContain("Acceptance criteria:\n- All tests must pass");
    expect(prompt).not.toContain("Intent content");
    expect(prompt).not.toContain("rules not found");
  });

  it("omits project rules when running rules are missing or empty", () => {
    const task: Task = {
      id: "TASK-005",
      title: "Optional rules",
      objective: "Keep prompt creation resilient",
      context: "",
      implementation: "",
      files: [],
      dependencies: [],
      constraints: [],
      acceptanceCriteria: [],
    };

    const missingRulesPath = service.createPromptFile("auth", task, "pt-BR");
    expect(gw.readFile(missingRulesPath)).not.toContain("PROJECT CODING RULES");

    gw.writeFile(PATHS.runningRules, "  \n  ");
    const emptyRulesPath = service.createPromptFile("auth", task, "pt-BR", ["compile failed"]);
    const retryPrompt = gw.readFile(emptyRulesPath);
    expect(retryPrompt).not.toContain("PROJECT CODING RULES");
    expect(retryPrompt).toContain("--- PREVIOUS ATTEMPT FAILURE & ERRORS ---\n- compile failed");
    expect(retryPrompt).toContain("Write generated prose in pt-BR; preserve JSON keys and technical code terms.");
  });

  it("appends non-empty running rules to both execution prompt paths", () => {
    gw.writeFile(PATHS.runningRules, "Prefer small functions.");
    const task: Task = {
      id: "TASK-006",
      title: "Use custom rules",
      objective: "Follow coding conventions",
      context: "",
      implementation: "",
      files: [],
      dependencies: [],
      constraints: [],
      acceptanceCriteria: [],
    };

    const runningPath = service.createPromptFile("auth", task, "en");
    const retryPath = service.createPromptFile("auth", task, "en", ["previous error"]);
    expect(gw.readFile(runningPath)).toContain("--- PROJECT CODING RULES ---\nPrefer small functions.");
    expect(gw.readFile(retryPath)).toContain("--- PROJECT CODING RULES ---\nPrefer small functions.");
  });

  it("selects buildRunningPrompt when previousErrors is omitted or empty", () => {
    gw.writeFile(".codeforge/intents/auth.md", "Intent content");

    const task: Task = {
      id: "TASK-004",
      title: "Normal Task",
      objective: "New feature",
      context: "First try",
      implementation: "Implement feature",
      files: [],
      dependencies: [],
      constraints: [],
      acceptanceCriteria: [],
    };

    // Omitted previousErrors
    const pathOmitted = service.createPromptFile("auth", task, "pt-BR");
    const promptOmitted = gw.readFile(pathOmitted);
    expect(promptOmitted).toContain("CodeForge task execution | TASK-004: Normal Task");
    expect(promptOmitted).toContain("Write generated prose in pt-BR; preserve JSON keys and technical code terms.");
    expect(promptOmitted).toContain("Intent: auth (.codeforge/intents/auth.md)");
    expect(promptOmitted).not.toContain("Intent content");
    expect(promptOmitted).not.toContain("PROJECT CODING RULES");

    // Empty previousErrors array
    const pathEmpty = service.createPromptFile("auth", task, "pt-BR", []);
    const promptEmpty = gw.readFile(pathEmpty);
    expect(promptEmpty).toContain("CodeForge task execution | TASK-004: Normal Task");
    expect(promptEmpty).not.toContain("Previous attempt errors:");
  });

  it("omits missing and empty review criteria while retaining the immutable review contract", () => {
    const missingPath = service.createReviewPromptFile("review", [], "diff", [], "en");
    const missingPrompt = gw.readFile(missingPath);
    expect(missingPrompt).toContain("Create zero files when approved; silence is the only approval signal.");
    expect(missingPrompt).toContain('"dependencies":[]');
    expect(missingPrompt).toContain("full task graph acyclic");
    expect(missingPrompt).not.toContain("PROJECT REVIEW CRITERIA");
    expect(missingPrompt).not.toContain("Review rules not found");

    gw.writeFile(PATHS.reviewRules, "  \n ");
    const emptyPath = service.createReviewPromptFile("review", [], "diff", [], "en");
    expect(gw.readFile(emptyPath)).not.toContain("PROJECT REVIEW CRITERIA");
  });

  it("appends non-empty review criteria separately from the immutable contract", () => {
    gw.writeFile(PATHS.reviewRules, "Check domain invariants.");
    const path = service.createReviewPromptFile("review", [], "diff", [], "en");
    const prompt = gw.readFile(path);
    expect(prompt).toContain("Create no other files and do not fix source code yourself");
    expect(prompt).toContain("--- PROJECT REVIEW CRITERIA ---\nCheck domain invariants.");
  });
});
