import { describe, it, expect } from "vitest";
import { InMemoryWorkspaceGateway } from "./in-memory-workspace.js";
import { TaskBuilder } from "./task-builder.js";
import { WorkspaceBuilder } from "./workspace-builder.js";
import { FakeProcessExecutor } from "./fake-process-executor.js";
import { InMemoryAgentRunner } from "./in-memory-agent-runner.js";
import { PATHS } from "../../src/infrastructure/paths.js";

describe("Test Infrastructure Helpers", () => {
  describe("InMemoryWorkspaceGateway", () => {
    it("initializes with initial files in constructor", () => {
      const gw = new InMemoryWorkspaceGateway({
        "README.md": "# Readme",
        "nested/file.txt": "content",
      });

      expect(gw.exists("README.md")).toBe(true);
      expect(gw.readFile("README.md")).toBe("# Readme");
      expect(gw.exists("nested/file.txt")).toBe(true);
      expect(gw.readFile("nested/file.txt")).toBe("content");
    });

    it("normalizes Windows backslashes and POSIX slashes uniformly", () => {
      const gw = new InMemoryWorkspaceGateway();
      gw.writeFile("dir\\subdir\\test.txt", "hello windows");

      expect(gw.exists("dir/subdir/test.txt")).toBe(true);
      expect(gw.readFile("dir/subdir/test.txt")).toBe("hello windows");
      expect(gw.exists("dir\\subdir\\test.txt")).toBe(true);
      expect(gw.readFile("dir\\subdir\\test.txt")).toBe("hello windows");
      expect(gw.exists("./dir/subdir/test.txt")).toBe(true);
    });

    it("fulfills the full WorkspaceGateway contract", () => {
      const gw = new InMemoryWorkspaceGateway();

      gw.mkdir("nested/folder");
      expect(gw.exists("nested/folder")).toBe(true);

      gw.writeFile("nested/folder/file1.txt", "content1");
      gw.writeFile("nested/folder/file2.txt", "content2");
      expect(gw.listDir("nested/folder")).toEqual(expect.arrayContaining(["file1.txt", "file2.txt"]));

      gw.deleteFile("nested/folder/file1.txt");
      expect(gw.exists("nested/folder/file1.txt")).toBe(false);

      gw.deleteDir("nested/folder");
      expect(gw.exists("nested/folder/file2.txt")).toBe(false);
      expect(gw.exists("nested/folder")).toBe(false);
    });

    it("throws ENOENT on reading non-existent file", () => {
      const gw = new InMemoryWorkspaceGateway();
      expect(() => gw.readFile("missing.txt")).toThrow("ENOENT");
    });
  });

  describe("TaskBuilder", () => {
    it("produces a complete Task with sensible defaults", () => {
      const task = new TaskBuilder().build();

      expect(task).toEqual({
        id: "TASK-001",
        title: "Default Title",
        objective: "Default Objective",
        context: "Default Context",
        implementation: "Default Implementation",
        files: [],
        dependencies: [],
        constraints: [],
        acceptanceCriteria: [],
      });
    });

    it("allows fluent overrides for all properties", () => {
      const task = TaskBuilder.aTask()
        .withId("TASK-042")
        .withTitle("Custom Task")
        .withObjective("Custom Objective")
        .withContext("Custom Context")
        .withImplementation("Custom Implementation")
        .withFiles(["src/index.ts"])
        .withDependencies(["TASK-001"])
        .withConstraints(["No breaking changes"])
        .withAcceptanceCriteria(["Tests pass"])
        .build();

      expect(task.id).toBe("TASK-042");
      expect(task.title).toBe("Custom Task");
      expect(task.objective).toBe("Custom Objective");
      expect(task.context).toBe("Custom Context");
      expect(task.implementation).toBe("Custom Implementation");
      expect(task.files).toEqual(["src/index.ts"]);
      expect(task.dependencies).toEqual(["TASK-001"]);
      expect(task.constraints).toEqual(["No breaking changes"]);
      expect(task.acceptanceCriteria).toEqual(["Tests pass"]);
    });

    it("isolates arrays so mutating returned task does not affect builder", () => {
      const builder = new TaskBuilder().withFiles(["initial.ts"]);
      const task1 = builder.build();
      task1.files.push("mutated.ts");

      const task2 = builder.build();
      expect(task2.files).toEqual(["initial.ts"]);
    });
  });

  describe("WorkspaceBuilder", () => {
    it("initializes standard directory structure", () => {
      const gw = new WorkspaceBuilder().build();

      expect(gw.exists(".codeforge")).toBe(true);
      expect(gw.exists(".codeforge/specs")).toBe(true);
      expect(gw.exists(".codeforge/tasks")).toBe(true);
      expect(gw.exists(".codeforge/executions")).toBe(true);
      expect(gw.exists(".codeforge/docs")).toBe(true);
    });

    it("fluently adds metadata, config, specs, tasks, and execution state", () => {
      const task1 = new TaskBuilder().withId("TASK-001").build();
      const task2 = new TaskBuilder().withId("TASK-002").build();

      const gw = WorkspaceBuilder.aWorkspace()
        .withMetadata()
        .withConfig({ environment: "test", plannerAgent: "p", executorAgent: "e" })
        .withSpec("feature-x", "# Spec Feature X")
        .withTasks("feature-x", [task1, task2])
        .withExecutionState("feature-x", {
          status: "running",
          tasks: { "TASK-001": { status: "completed" } },
        })
        .build();

      expect(gw.exists(PATHS.metadata)).toBe(true);
      expect(gw.exists(PATHS.config)).toBe(true);
      expect(gw.exists(PATHS.specFile("feature-x"))).toBe(true);
      expect(gw.readFile(PATHS.specFile("feature-x"))).toBe("# Spec Feature X");
      expect(gw.exists(PATHS.taskFile("feature-x", "TASK-001"))).toBe(true);
      expect(gw.exists(PATHS.taskFile("feature-x", "TASK-002"))).toBe(true);
      expect(gw.exists(PATHS.executionState("feature-x"))).toBe(true);

      const parsedState = JSON.parse(gw.readFile(PATHS.executionState("feature-x")));
      expect(parsedState.status).toBe("running");
      expect(parsedState.tasks["TASK-001"].status).toBe("completed");
    });
  });

  describe("FakeProcessExecutor", () => {
    it("simulates exec and records call details", async () => {
      const executor = new FakeProcessExecutor();
      executor.registerResponse("node -v", { stdout: "v20.0.0\n" });

      const result = await executor.exec("node -v", { cwd: "/app" });

      expect(result.stdout).toBe("v20.0.0\n");
      expect(result.exitCode).toBe(0);
      expect(executor.hasExecuted("node -v")).toBe(true);
      expect(executor.execCalls).toHaveLength(1);
      expect(executor.execCalls[0].command).toBe("node -v");
      expect(executor.execCalls[0].options?.cwd).toBe("/app");
    });

    it("simulates spawn with arguments and regexp matcher", async () => {
      const executor = new FakeProcessExecutor();
      executor.registerResponse(/git status/, { stdout: "clean", exitCode: 0 });

      const result = await executor.spawn("git", ["status", "--porcelain"]);

      expect(result.stdout).toBe("clean");
      expect(executor.hasExecuted("git status")).toBe(true);
      expect(executor.spawnCalls).toHaveLength(1);
      expect(executor.spawnCalls[0].args).toEqual(["status", "--porcelain"]);
    });

    it("supports custom dynamic command handlers", async () => {
      const executor = new FakeProcessExecutor();
      executor.registerHandler("echo", (_cmd, args) => ({
        stdout: args ? args.join(" ") : "",
        stderr: "",
        exitCode: 0,
      }));

      const result = await executor.spawn("echo", ["hello", "world"]);
      expect(result.stdout).toBe("hello world");
    });

    it("returns default response when no matcher matches", async () => {
      const executor = new FakeProcessExecutor();
      executor.setDefaultResponse({ stdout: "default output", exitCode: 42 });

      const result = await executor.exec("unknown-command");
      expect(result.stdout).toBe("default output");
      expect(result.exitCode).toBe(42);
    });
  });

  describe("InMemoryAgentRunner", () => {
    it("succeeds immediately and records TaskContext", async () => {
      const runner = new InMemoryAgentRunner();
      const context = {
        promptFilePath: "/path/to/prompt.md",
        specName: "my-spec",
        taskId: "TASK-001",
      };

      await runner.execute(context);

      expect(runner.hasExecuted("TASK-001")).toBe(true);
      expect(runner.executedContexts).toEqual([context]);
    });

    it("throws configured general error", async () => {
      const runner = new InMemoryAgentRunner().withError("Runner failed");

      await expect(
        runner.execute({ promptFilePath: "p", specName: "s", taskId: "T1" })
      ).rejects.toThrow("Runner failed");
    });

    it("throws configured task-specific error", async () => {
      const runner = new InMemoryAgentRunner().withErrorForTask("T2", "Task T2 failed");

      await expect(
        runner.execute({ promptFilePath: "p", specName: "s", taskId: "T1" })
      ).resolves.toBeUndefined();

      await expect(
        runner.execute({ promptFilePath: "p", specName: "s", taskId: "T2" })
      ).rejects.toThrow("Task T2 failed");
    });

    it("executes custom handler", async () => {
      const executed: string[] = [];
      const runner = new InMemoryAgentRunner().withHandler((ctx) => {
        executed.push(ctx.taskId!);
      });

      await runner.execute({ promptFilePath: "p", specName: "s", taskId: "T1" });
      await runner.execute({ promptFilePath: "p", specName: "s", taskId: "T2" });

      expect(executed).toEqual(["T1", "T2"]);
    });

    it("returns available agents", async () => {
      const runner = new InMemoryAgentRunner().withAvailableAgents(["agent-a", "agent-b"]);
      const agents = await runner.getAvailableAgents();
      expect(agents).toEqual(["agent-a", "agent-b"]);
    });
  });
});
