import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import { Text } from "ink";
import {
  ExecutionProvider,
  useExecution,
  ExecutionContextValue,
} from "../../../../src/cli/tui/context/ExecutionContext.js";
import { ContainerProvider } from "../../../../src/cli/tui/context/ContainerContext.js";
import { TaskScheduler } from "../../../../src/scheduler/TaskScheduler.js";
import { InMemoryWorkspaceGateway } from "../../../helpers/in-memory-workspace.js";
import { InMemoryAgentRunner } from "../../../helpers/in-memory-agent-runner.js";
import { TaskBuilder } from "../../../helpers/task-builder.js";
import { ExecutionStateRepository } from "../../../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../../../src/application/services/PromptService.js";
import { Task } from "../../../../src/domain/task.js";
import { createAppContainer, AppContainer } from "../../../../src/infrastructure/container.js";

const tick = (ms = 70) => new Promise((resolve) => setTimeout(resolve, ms));

describe("ExecutionContext", () => {
  let gw: InMemoryWorkspaceGateway;
  let runner: InMemoryAgentRunner;
  let stateRepo: ExecutionStateRepository;
  let promptService: PromptService;
  let scheduler: TaskScheduler;
  let container: AppContainer;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    runner = new InMemoryAgentRunner();
    stateRepo = new ExecutionStateRepository(gw);
    promptService = new PromptService(gw);
    container = createAppContainer(gw, {
      runnerProvider: () => runner,
      executionStateRepository: stateRepo,
      promptService,
    });

    scheduler = container.createTaskScheduler(runner, {
      environment: "test",
      plannerAgent: "mock",
      executorAgent: "mock",
      language: "en",
    });

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
      <ExecutionProvider scheduler={scheduler} container={container} initialSpec="test-spec">
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

  it("acts as the authoritative single owner of activeSpec when switching specs", async () => {
    const taskA = TaskBuilder.aTask().withId("TASK-A").withTitle("Task A").build();
    const taskB = TaskBuilder.aTask().withId("TASK-B").withTitle("Task B").build();
    writeTask("spec-a", taskA);
    writeTask("spec-b", taskB);

    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Spec: {contextValue.activeSpec}</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} container={container} initialSpec="spec-a">
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();
    expect(contextValue?.activeSpec).toBe("spec-a");
    expect(contextValue?.tasks[0].id).toBe("TASK-A");

    // Switch spec to spec-b
    contextValue?.setActiveSpec("spec-b");
    await tick();

    expect(contextValue?.activeSpec).toBe("spec-b");
    expect(contextValue?.tasks[0].id).toBe("TASK-B");

    // Deselect spec
    contextValue?.setActiveSpec(null);
    await tick();

    expect(contextValue?.activeSpec).toBeNull();
    expect(contextValue?.tasks).toEqual([]);
    expect(contextValue?.selectedTaskId).toBeNull();
  });

  it("consumes AppContainer via useContainer() when wrapped in ContainerProvider", () => {
    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Consumer</Text>;
    };

    render(
      <ContainerProvider container={container}>
        <ExecutionProvider scheduler={scheduler} initialSpec="test-spec">
          <TestConsumer />
        </ExecutionProvider>
      </ContainerProvider>,
    );

    expect(contextValue).not.toBeNull();
    expect(contextValue?.activeSpec).toBe("test-spec");
  });

  it("buffers log chunks per-task and enforces maxLogLines capacity", async () => {
    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Logs: {Object.keys(contextValue.logs).length}</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} container={container} maxLogLines={3}>
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();

    // Emit logs for TASK-001 via reporter
    scheduler.getReporter()?.onLog?.("TASK-001", "line 1\nline 2");

    await tick();

    expect(contextValue?.getTaskLogs("TASK-001")).toEqual(["line 1", "line 2"]);

    // Emit more lines exceeding maxLogLines (3)
    scheduler.getReporter()?.onLog?.("TASK-001", "line 3\nline 4\nline 5");

    await tick();

    // Bound to last 3 lines
    expect(contextValue?.getTaskLogs("TASK-001")).toEqual([
      "line 3",
      "line 4",
      "line 5",
    ]);

    // Independent buffer for TASK-002
    scheduler.getReporter()?.onLog?.("TASK-002", "other task log");

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
      <ExecutionProvider scheduler={scheduler} container={container} initialSpec="test-spec">
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();
    expect(contextValue?.tasks[0].status).toBe("pending");

    // Task started
    const state = stateRepo.init("test-spec", [task1]);
    state.tasks["TASK-001"].status = "running";
    state.tasks["TASK-001"].startedAt = new Date().toISOString();
    stateRepo.save(state);
    scheduler.getReporter()?.onUpdate("test-spec");
    await tick();
    expect(contextValue?.tasks[0].status).toBe("running");

    // Task failed
    state.tasks["TASK-001"].status = "failed";
    state.tasks["TASK-001"].completedAt = new Date().toISOString();
    state.tasks["TASK-001"].errors = ["Compilation error"];
    stateRepo.save(state);
    scheduler.getReporter()?.onUpdate("test-spec");
    await tick();
    expect(contextValue?.tasks[0].status).toBe("failed");
    expect(contextValue?.tasks[0].errors).toEqual(["Compilation error"]);

    // Task completed
    state.tasks["TASK-001"].status = "completed";
    state.tasks["TASK-001"].completedAt = new Date().toISOString();
    delete state.tasks["TASK-001"].errors;
    stateRepo.save(state);
    scheduler.getReporter()?.onUpdate("test-spec");
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
      <ExecutionProvider scheduler={scheduler} container={container}>
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();
    expect(contextValue?.schedulerStatus).toBe("idle");

    scheduler.getReporter()?.onStart("test-spec");
    await tick();
    expect(contextValue?.schedulerStatus).toBe("running");

    scheduler.getReporter()?.onDeadlock("test-spec");
    await tick();
    expect(contextValue?.schedulerStatus).toBe("deadlock");

    scheduler.getReporter()?.onFail("test-spec");
    await tick();
    expect(contextValue?.schedulerStatus).toBe("failed");

    scheduler.getReporter()?.onComplete("test-spec");
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
      <ExecutionProvider scheduler={scheduler} container={container} initialSpec="test-spec">
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();

    // Test selectTask
    contextValue?.selectTask("TASK-002");
    await tick();

    expect(contextValue?.selectedTaskId).toBe("TASK-002");
    expect(contextValue?.selectedTask?.id).toBe("TASK-002");

    // Test dispatch spies on TaskOperationsUseCase
    const retrySpy = vi.spyOn(container.taskOperationsUseCase, "retryTask");
    const retryAllSpy = vi.spyOn(container.taskOperationsUseCase, "retrySpec");
    const completeSpy = vi.spyOn(container.taskOperationsUseCase, "markTaskCompleted");
    const resetSpy = vi.spyOn(container.taskOperationsUseCase, "resetTasks");

    await contextValue?.retryTask("TASK-001");
    expect(retrySpy).toHaveBeenCalledWith("test-spec", "TASK-001");

    await contextValue?.retryAllFailed();
    expect(retryAllSpy).toHaveBeenCalledWith("test-spec");

    await contextValue?.completeTask("TASK-002");
    expect(completeSpy).toHaveBeenCalledWith("test-spec", "TASK-002");

    await contextValue?.resetTask("TASK-001");
    expect(resetSpy).toHaveBeenCalledWith("test-spec", "TASK-001");
  });

  it("triggers startRun and executes spec through scheduler", async () => {
    const task = TaskBuilder.aTask().withId("TASK-001").build();
    writeTask("test-spec", task);

    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Running</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} container={container} initialSpec="test-spec">
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();
    await contextValue!.startRun("test-spec");
    await tick();

    expect(contextValue?.status).toBe("completed");
    expect(contextValue?.tasks[0].status).toBe("completed");
  });

  it("automatically starts run when autoStart is true", async () => {
    const task = TaskBuilder.aTask().withId("TASK-001").build();
    writeTask("test-spec", task);

    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>AutoStart</Text>;
    };

    render(
      <ExecutionProvider
        scheduler={scheduler}
        container={container}
        initialSpec="test-spec"
        autoStart={true}
      >
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick(100);

    expect(contextValue?.status).toBe("completed");
    expect(contextValue?.tasks[0].status).toBe("completed");
  });

  it("resets all tasks via resetAllTasks", async () => {
    const task = TaskBuilder.aTask().withId("TASK-001").build();
    writeTask("test-spec", task);

    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>ResetAll</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} container={container} initialSpec="test-spec">
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();
    const resetSpy = vi.spyOn(container.taskOperationsUseCase, "resetTasks");

    await contextValue?.resetAllTasks("test-spec");

    expect(resetSpy).toHaveBeenCalledWith("test-spec");
  });

  it("batches 100 log events emitted in rapid burst into few state updates with zero loss", async () => {
    let renderCount = 0;
    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      renderCount++;
      return <Text>Render count: {renderCount}, Logs count: {contextValue.logs["TASK-BURST"]?.length ?? 0}</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} container={container} flushIntervalMs={50}>
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick(70);
    const baseRenderCount = renderCount;

    // Rapidly emit 100 log chunks
    for (let i = 0; i < 100; i++) {
      scheduler.getReporter()?.onLog?.("TASK-BURST", `event-${i}\n`);
    }

    // Immediately after synchronous emission, renderCount should not have jumped by 100
    expect(renderCount).toBe(baseRenderCount);

    // Allow batch timer to flush
    await tick(80);

    // All 100 logs are present
    const taskLogs = contextValue!.getTaskLogs("TASK-BURST");
    expect(taskLogs).toHaveLength(100);
    expect(taskLogs[0]).toBe("event-0");
    expect(taskLogs[99]).toBe("event-99");

    // Re-renders should be grouped (at most 2 renders occurred for 100 events)
    expect(renderCount - baseRenderCount).toBeLessThanOrEqual(2);
  });

  it("performs immediate flush on onComplete, onFail and onDeadlock without waiting for timer", async () => {
    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Logs: {Object.keys(contextValue.logs).length}</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} container={container} flushIntervalMs={500}>
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick(30);

    // Emit log chunk with large flushInterval (500ms)
    scheduler.getReporter()?.onLog?.("TASK-COMPLETE", "finishing chunk\n");

    // Immediately trigger onComplete
    scheduler.getReporter()?.onComplete("test-spec");
    await tick(30);

    // Should be flushed immediately despite 500ms timer
    expect(contextValue?.getTaskLogs("TASK-COMPLETE")).toEqual(["finishing chunk"]);

    // Test onFail immediate flush
    scheduler.getReporter()?.onLog?.("TASK-FAIL", "error chunk\n");
    scheduler.getReporter()?.onFail("test-spec");
    await tick(30);
    expect(contextValue?.getTaskLogs("TASK-FAIL")).toEqual(["error chunk"]);
  });

  it("cleans up timer and performs immediate flush on provider unmount", async () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const TestConsumer = () => {
      useExecution();
      return <Text>Consumer</Text>;
    };

    const { unmount } = render(
      <ExecutionProvider scheduler={scheduler} container={container} flushIntervalMs={500}>
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick(30);

    // Emit log that is buffered but not yet flushed by timer
    scheduler.getReporter()?.onLog?.("TASK-UNMOUNT", "unmount chunk\n");

    // Unmount the provider
    unmount();

    // Verify timer cleanup
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  it("does not trigger redundant re-renders when onUpdate receives identical task data", async () => {
    const task1 = TaskBuilder.aTask()
      .withId("TASK-001")
      .withTitle("Task 1")
      .build();
    writeTask("test-spec", task1);

    let renderCount = 0;
    const TestConsumer = () => {
      const { tasks } = useExecution();
      renderCount++;
      return <Text>Tasks: {tasks.length}, renders: {renderCount}</Text>;
    };

    render(
      <ExecutionProvider scheduler={scheduler} container={container} initialSpec="test-spec">
        <TestConsumer />
      </ExecutionProvider>,
    );

    await tick();
    const baseRenderCount = renderCount;

    // Trigger onUpdate 5 times without modifying disk or state
    for (let i = 0; i < 5; i++) {
      scheduler.getReporter()?.onUpdate("test-spec");
    }
    await tick();

    // No redundant re-renders
    expect(renderCount).toBe(baseRenderCount);
  });
});
