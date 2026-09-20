import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useExecution,
  ExecutionContextValue,
} from '../../../../src/cli/tui/context/ExecutionContext.js';
import { TaskScheduler } from '../../../../src/scheduler/TaskScheduler.js';
import { InMemoryWorkspaceGateway } from '../../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../../helpers/in-memory-agent-runner.js';
import { TaskBuilder } from '../../../helpers/task-builder.js';
import { ExecutionStateRepository } from '../../../../src/infrastructure/repositories/ExecutionStateRepository.js';
import { PromptService } from '../../../../src/application/services/PromptService.js';
import { Task } from '../../../../src/domain/task.js';
import { createAppContainer, AppContainer } from '../../../../src/infrastructure/container.js';
import { renderWithProviders, flushAsync } from '../helpers/renderWithProviders.js';

describe('ExecutionContext', () => {
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
      environment: 'test',
      plannerAgent: 'mock',
      executorAgent: 'mock',
      language: 'en',
    });

    gw.mkdir('.codeforge/tasks/test-intent');
  });

  function writeTask(intentName: string, task: Task): void {
    gw.mkdir(`.codeforge/tasks/${intentName}`);
    gw.writeFile(
      `.codeforge/tasks/${intentName}/${task.id}.json`,
      JSON.stringify(task),
    );
  }

  it('buffers log chunks per task respecting maximum capacity (maxLogLines)', async () => {
    let contextValue!: ExecutionContextValue;
    const TestConsumer = () => {
      contextValue = useExecution();
      return null;
    };

    const { unmount } = renderWithProviders(<TestConsumer />, {
      container,
      scheduler,
      maxLogLines: 3,
      flushIntervalMs: 0,
    });

    await flushAsync(1);

    // Emit logs for TASK-001
    scheduler.getReporter()?.onLog?.('TASK-001', 'line 1\nline 2');
    await vi.waitFor(() => {
      expect(contextValue?.getTaskLogs('TASK-001')).toEqual(['line 1', 'line 2']);
    }, { interval: 2, timeout: 100 });

    // Emit more lines exceeding maxLogLines (3)
    scheduler.getReporter()?.onLog?.('TASK-001', 'line 3\nline 4\nline 5');
    await vi.waitFor(() => {
      expect(contextValue?.getTaskLogs('TASK-001')).toEqual([
        'line 3',
        'line 4',
        'line 5',
      ]);
    }, { interval: 2, timeout: 100 });

    // Independent buffer for TASK-002
    scheduler.getReporter()?.onLog?.('TASK-002', 'other task log');
    await vi.waitFor(() => {
      expect(contextValue?.getTaskLogs('TASK-002')).toEqual(['other task log']);
    }, { interval: 2, timeout: 100 });

    // Clear logs for TASK-002
    contextValue?.clearLogs('TASK-002');
    await vi.waitFor(() => {
      expect(contextValue?.getTaskLogs('TASK-002')).toEqual([]);
      expect(contextValue?.getTaskLogs('TASK-001')).toHaveLength(3);
    }, { interval: 2, timeout: 100 });

    unmount();
  });

  it('updates task status in response to lifecycle events (onStart, onUpdate, onComplete)', async () => {
    const task1 = TaskBuilder.aTask()
      .withId('TASK-001')
      .withTitle('Task 1')
      .build();
    writeTask('test-intent', task1);

    let contextValue!: ExecutionContextValue;
    const TestConsumer = () => {
      contextValue = useExecution();
      return null;
    };

    const { unmount } = renderWithProviders(<TestConsumer />, {
      container,
      scheduler,
      initialIntent: 'test-intent',
      flushIntervalMs: 0,
    });

    await flushAsync(1);
    expect(contextValue?.tasks[0].status).toBe('pending');

    // Task started
    const state = stateRepo.init('test-intent', [task1]);
    state.tasks['TASK-001'].status = 'running';
    state.tasks['TASK-001'].startedAt = new Date().toISOString();
    stateRepo.save(state);
    scheduler.getReporter()?.onStart('test-intent');
    await vi.waitFor(() => {
      expect(contextValue?.tasks[0].status).toBe('running');
    });

    // Task updated with error
    state.tasks['TASK-001'].status = 'failed';
    state.tasks['TASK-001'].errors = ['Syntax error'];
    stateRepo.save(state);
    scheduler.getReporter()?.onUpdate('test-intent');
    await vi.waitFor(() => {
      expect(contextValue?.tasks[0].status).toBe('failed');
      expect(contextValue?.tasks[0].errors).toEqual(['Syntax error']);
    });

    // Task completed
    state.tasks['TASK-001'].status = 'completed';
    delete state.tasks['TASK-001'].errors;
    stateRepo.save(state);
    scheduler.getReporter()?.onComplete('test-intent');
    await vi.waitFor(() => {
      expect(contextValue?.tasks[0].status).toBe('completed');
      expect(contextValue?.tasks[0].errors).toBeUndefined();
    });

    unmount();
  });

  it('updates schedulerStatus in response to execution run events', async () => {
    let contextValue!: ExecutionContextValue;
    const TestConsumer = () => {
      contextValue = useExecution();
      return null;
    };

    const { unmount } = renderWithProviders(<TestConsumer />, {
      container,
      scheduler,
      flushIntervalMs: 0,
    });

    await flushAsync(1);
    expect(contextValue?.schedulerStatus).toBe('idle');

    scheduler.getReporter()?.onStart('test-intent');
    await flushAsync(1);
    expect(contextValue?.schedulerStatus).toBe('running');

    scheduler.getReporter()?.onComplete('test-intent');
    await flushAsync(1);
    expect(contextValue?.schedulerStatus).toBe('completed');

    scheduler.getReporter()?.onFail('test-intent');
    await flushAsync(1);
    expect(contextValue?.schedulerStatus).toBe('failed');

    scheduler.getReporter()?.onDeadlock('test-intent');
    await flushAsync(1);
    expect(contextValue?.schedulerStatus).toBe('deadlock');

    unmount();
  });

  it('updates activeHook on hook start and moves it to hookHistory on hook completion', async () => {
    let contextValue!: ExecutionContextValue;
    const TestConsumer = () => {
      contextValue = useExecution();
      return null;
    };

    const { unmount } = renderWithProviders(<TestConsumer />, {
      container,
      scheduler,
      flushIntervalMs: 0,
    });

    await flushAsync(1);
    expect(contextValue.activeHook).toBeNull();
    expect(contextValue.hookHistory).toEqual([]);

    const hookReporter = scheduler.getHookReporter();
    expect(hookReporter).toBeDefined();

    // Start hook
    hookReporter?.onHookStart({
      event: 'task.verify',
      definition: {
        name: 'lint',
        run: 'npm run lint',
        type: 'gate',
      },
      context: {
        event: 'task.verify',
        intentName: 'test-intent',
        taskId: 'TASK-001',
      },
      startedAt: 12345,
    });

    await vi.waitFor(() => {
      expect(contextValue.activeHook).toEqual({
        name: 'lint',
        event: 'task.verify',
        command: 'npm run lint',
        type: 'gate',
        taskId: 'TASK-001',
        startedAt: 12345,
      });
      expect(contextValue.hookHistory).toEqual([]);
    });

    // Complete hook
    hookReporter?.onHookEnd({
      event: 'task.verify',
      definition: {
        name: 'lint',
        run: 'npm run lint',
        type: 'gate',
      },
      context: {
        event: 'task.verify',
        intentName: 'test-intent',
        taskId: 'TASK-001',
      },
      result: {
        name: 'lint',
        type: 'gate',
        ok: true,
        exitCode: 0,
        output: 'All lint checks passed',
      },
      durationMs: 350,
    });

    await vi.waitFor(() => {
      expect(contextValue.activeHook).toBeNull();
      expect(contextValue.hookHistory).toHaveLength(1);
      const item = contextValue.hookHistory[0];
      expect(item.name).toBe('lint');
      expect(item.event).toBe('task.verify');
      expect(item.command).toBe('npm run lint');
      expect(item.type).toBe('gate');
      expect(item.ok).toBe(true);
      expect(item.exitCode).toBe(0);
      expect(item.outputSummary).toBe('All lint checks passed');
      expect(item.durationMs).toBe(350);
      expect(typeof item.id).toBe('string');
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.timestamp).toBe('string');
    });

    unmount();
  });

  it('caps hookHistory at maximum 10 items as a rolling buffer', async () => {
    let contextValue!: ExecutionContextValue;
    const TestConsumer = () => {
      contextValue = useExecution();
      return null;
    };

    const { unmount } = renderWithProviders(<TestConsumer />, {
      container,
      scheduler,
      flushIntervalMs: 0,
    });

    await flushAsync(1);
    const hookReporter = scheduler.getHookReporter();
    expect(hookReporter).toBeDefined();

    // Trigger 15 hook completions
    for (let i = 0; i < 15; i++) {
      hookReporter?.onHookEnd({
        event: 'task.completed',
        definition: {
          name: `hook-${i}`,
          run: `echo ${i}`,
          type: 'notify',
        },
        context: {
          event: 'task.completed',
          intentName: 'test-intent',
          taskId: `TASK-${i}`,
        },
        result: {
          name: `hook-${i}`,
          type: 'notify',
          ok: true,
          exitCode: 0,
          output: `Output ${i}`,
        },
        durationMs: 100 + i,
      });
    }

    await vi.waitFor(() => {
      expect(contextValue.hookHistory).toHaveLength(10);
      // Most recent should be at index 0 (hook-14)
      expect(contextValue.hookHistory[0].name).toBe('hook-14');
      // 10th item should be hook-5
      expect(contextValue.hookHistory[9].name).toBe('hook-5');
    });

    unmount();
  });

  it('clears activeHook and hookHistory on reset when intent changes', async () => {
    let contextValue!: ExecutionContextValue;
    const TestConsumer = () => {
      contextValue = useExecution();
      return null;
    };

    const { unmount } = renderWithProviders(<TestConsumer />, {
      container,
      scheduler,
      initialIntent: 'test-intent',
      flushIntervalMs: 0,
    });

    await flushAsync(1);
    const hookReporter = scheduler.getHookReporter();

    // Add a completed hook to history
    hookReporter?.onHookEnd({
      event: 'run.started',
      definition: {
        name: 'notify-start',
        run: 'echo start',
      },
      context: {
        event: 'run.started',
        intentName: 'test-intent',
      },
      result: {
        name: 'notify-start',
        type: 'notify',
        ok: true,
        exitCode: 0,
        output: '',
      },
      durationMs: 50,
    });

    // Start another hook so activeHook is populated
    hookReporter?.onHookStart({
      event: 'task.verify',
      definition: {
        name: 'test-hook',
        run: 'echo test',
      },
      context: {
        event: 'task.verify',
        intentName: 'test-intent',
      },
      startedAt: Date.now(),
    });

    await vi.waitFor(() => {
      expect(contextValue.activeHook).not.toBeNull();
      expect(contextValue.hookHistory).toHaveLength(1);
    });

    // Reset intent selection
    contextValue.setActiveIntent(null);

    await vi.waitFor(() => {
      expect(contextValue.activeHook).toBeNull();
      expect(contextValue.hookHistory).toEqual([]);
    });

    unmount();
  });
});
