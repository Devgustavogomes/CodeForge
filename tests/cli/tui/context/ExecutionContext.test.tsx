import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import { Text } from "ink";
import {
  ExecutionProvider,
  useExecution,
  ExecutionContextValue,
} from "../../../../src/cli/tui/context/ExecutionContext.js";
import { ReactiveTaskScheduler } from "../../../../src/scheduler/ReactiveTaskScheduler.js";
import { InMemoryWorkspaceGateway } from "../../../helpers/in-memory-workspace.js";
import { InMemoryAgentRunner } from "../../../helpers/in-memory-agent-runner.js";
import { TaskBuilder } from "../../../helpers/task-builder.js";
import { ExecutionStateRepository } from "../../../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../../../src/application/services/PromptService.js";
import { Task } from "../../../../src/domain/task.js";

const tick = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));

describe("ExecutionContext", () => {
  let gw: InMemoryWorkspaceGateway;
  let runner: InMemoryAgentRunner;
  let stateRepo: ExecutionStateRepository;
  let promptService: PromptService;
  let scheduler: ReactiveTaskScheduler;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    runner = new InMemoryAgentRunner();
    stateRepo = new ExecutionStateRepository(gw);
    promptService = new PromptService(gw);

    scheduler = new ReactiveTaskScheduler(
      gw,
      runner,
      {
        environment: "test",
        plannerAgent: "mock",
        executorAgent: "mock",
        language: "en",
      },
      stateRepo,
      promptService,
    );

    gw.mkdir(".codeforge/tasks/test-spec");
  });

  function writeTask(specName: string, task: Task): void {
    gw.mkdir(`.codeforge/tasks/${specName}`);
    gw.writeFile(
      `.codeforge/tasks/${specName}/${task.id}.json`,
      JSON.stringify(task),
    );
  }

  it("throws when useExecution is used outside ExecutionProvider", () => {
    let error: Error | null = null;
    const TestComponent = () => {
      try {
        useExecution();
      } catch (err) {
        error = err as Error;
      }
      return <Text>test</Text>;
    };

    render(<TestComponent />);
    expect(error).not.toBeNull();
    expect(error?.message).toBe(
      "useExecution must be used within an ExecutionProvider",
    );
  });

  it("provides initial execution state and loads spec tasks", () => {
    const task1 = TaskBuilder.aTask()
      .withId("TASK-001")
      .withTitle("Initial Task")
      .build();
    writeTask("test-spec", task1);

    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Consumer</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} initialSpec="test-spec">
        <TestConsumer />
      </ExecutionProvider>,
    );

    expect(contextValue).not.toBeNull();
    expect(contextValue?.activeSpec).toBe("test-spec");
    expect(contextValue?.tasks).toHaveLength(1);
    expect(contextValue?.tasks[0].id).toBe("TASK-001");
    expect(contextValue?.tasks[0].title).toBe("Initial Task");
    expect(contextValue?.tasks[0].status).toBe("pending");
    expect(contextValue?.selectedTaskId).toBe("TASK-001");
    expect(contextValue?.selectedTask?.id).toBe("TASK-001");
    expect(contextValue?.status).toBe("idle");
    expect(contextValue?.logs).toEqual({});
  });

  it("buffers log chunks per-task and enforces maxLogLines capacity", async () => {
    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Logs: {Object.keys(contextValue.logs).length}</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} maxLogLines={3}>
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();

    // Emit logs for TASK-001
    scheduler.emit("task:log", {
      specName: "test-spec",
      taskId: "TASK-001",
      chunk: "line 1\nline 2",
    });

    await tick();

    expect(contextValue?.getTaskLogs("TASK-001")).toEqual(["line 1", "line 2"]);

    // Emit more lines exceeding maxLogLines (3)
    scheduler.emit("task:log", {
      specName: "test-spec",
      taskId: "TASK-001",
      chunk: "line 3\nline 4\nline 5",
    });

    await tick();

    // Bound to last 3 lines
    expect(contextValue?.getTaskLogs("TASK-001")).toEqual([
      "line 3",
      "line 4",
      "line 5",
    ]);

    // Independent buffer for TASK-002
    scheduler.emit("task:log", {
      specName: "test-spec",
      taskId: "TASK-002",
      chunk: "other task log",
    });

    await tick();

    expect(contextValue?.getTaskLogs("TASK-002")).toEqual(["other task log"]);

    // clearLogs
    contextValue?.clearLogs("TASK-002");
    await tick();

    expect(contextValue?.getTaskLogs("TASK-002")).toEqual([]);
    expect(contextValue?.getTaskLogs("TASK-001")).toHaveLength(3);
  });

  it("updates live task statuses when lifecycle events are received", async () => {
    const task1 = TaskBuilder.aTask()
      .withId("TASK-001")
      .withTitle("Task 1")
      .build();
    writeTask("test-spec", task1);

    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Consumer</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} initialSpec="test-spec">
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();
    expect(contextValue?.tasks[0].status).toBe("pending");

    // Task started
    scheduler.emit("task:started", {
      specName: "test-spec",
      taskId: "TASK-001",
    });
    await tick();
    expect(contextValue?.tasks[0].status).toBe("running");

    // Task failed
    scheduler.emit("task:failed", {
      specName: "test-spec",
      taskId: "TASK-001",
      errors: ["Compilation error"],
    });
    await tick();
    expect(contextValue?.tasks[0].status).toBe("failed");
    expect(contextValue?.tasks[0].errors).toEqual(["Compilation error"]);

    // Task completed
    scheduler.emit("task:completed", {
      specName: "test-spec",
      taskId: "TASK-001",
    });
    await tick();
    expect(contextValue?.tasks[0].status).toBe("completed");
    expect(contextValue?.tasks[0].errors).toBeUndefined();
  });

  it("updates schedulerStatus on run events", async () => {
    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Status: {contextValue.schedulerStatus}</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler}>
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();
    expect(contextValue?.schedulerStatus).toBe("idle");

    scheduler.emit("run:started", { specName: "test-spec" });
    await tick();
    expect(contextValue?.schedulerStatus).toBe("running");

    scheduler.emit("run:deadlock", { specName: "test-spec" });
    await tick();
    expect(contextValue?.schedulerStatus).toBe("deadlock");

    scheduler.emit("run:failed", { specName: "test-spec", reason: "error" });
    await tick();
    expect(contextValue?.schedulerStatus).toBe("failed");

    scheduler.emit("run:completed", { specName: "test-spec" });
    await tick();
    expect(contextValue?.schedulerStatus).toBe("completed");
  });

  it("exposes dispatch methods and selectedTaskId controls", async () => {
    const task1 = TaskBuilder.aTask()
      .withId("TASK-001")
      .withTitle("Task 1")
      .build();
    const task2 = TaskBuilder.aTask()
      .withId("TASK-002")
      .withTitle("Task 2")
      .build();
    writeTask("test-spec", task1);
    writeTask("test-spec", task2);

    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Consumer</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} initialSpec="test-spec">
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();

    // Test selectTask
    contextValue?.selectTask("TASK-002");
    await tick();

    expect(contextValue?.selectedTaskId).toBe("TASK-002");
    expect(contextValue?.selectedTask?.id).toBe("TASK-002");

    // Test dispatch spies
    const retrySpy = vi.spyOn(scheduler, "retryTask").mockResolvedValue(undefined);
    const retryAllSpy = vi.spyOn(scheduler, "retryAllFailed").mockResolvedValue(undefined);
    const completeSpy = vi.spyOn(scheduler, "completeTask").mockResolvedValue(undefined);
    const resetSpy = vi.spyOn(scheduler, "resetTask").mockResolvedValue(undefined);

    await contextValue?.retryTask("TASK-001");
    expect(retrySpy).toHaveBeenCalledWith("TASK-001", "test-spec");

    await contextValue?.retryAllFailed();
    expect(retryAllSpy).toHaveBeenCalledWith("test-spec");

    await contextValue?.completeTask("TASK-002");
    expect(completeSpy).toHaveBeenCalledWith("TASK-002", "test-spec");

    await contextValue?.resetTask("TASK-001");
    expect(resetSpy).toHaveBeenCalledWith("TASK-001", "test-spec");
  });

  it("triggers startRun and executes spec through scheduler", async () => {
    const task = TaskBuilder.aTask().withId("TASK-001").build();
    writeTask("test-spec", task);

    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      useEffect(() => {
        void contextValue.startRun("test-spec");
      }, []);
      return <Text>Running</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler}>
        <TestConsumer />
      </ExecutionProvider>,
    );

    // Wait for run to settle
    await scheduler.waitForSettled();
    await tick();

    expect(contextValue?.status).toBe("completed");
    expect(contextValue?.tasks[0].status).toBe("completed");
  });
});
