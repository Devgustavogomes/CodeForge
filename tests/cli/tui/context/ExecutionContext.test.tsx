import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Text } from 'ink';
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

    gw.mkdir('.codeforge/tasks/test-spec');
  });

  function writeTask(specName: string, task: Task): void {
    gw.mkdir(`.codeforge/tasks/${specName}`);
    gw.writeFile(
      `.codeforge/tasks/${specName}/${task.id}.json`,
      JSON.stringify(task),
    );
  }

  it('buffers log chunks per task respecting maximum capacity (maxLogLines)', async () => {
    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Logs: {Object.keys(contextValue.logs).length}</Text>;
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
    writeTask('test-spec', task1);

    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Consumer</Text>;
    };

    const { unmount } = renderWithProviders(<TestConsumer />, {
      container,
      scheduler,
      initialSpec: 'test-spec',
      flushIntervalMs: 0,
    });

    await flushAsync(1);
    expect(contextValue?.tasks[0].status).toBe('pending');

    // Task started
    const state = stateRepo.init('test-spec', [task1]);
    state.tasks['TASK-001'].status = 'running';
    state.tasks['TASK-001'].startedAt = new Date().toISOString();
    stateRepo.save(state);
    scheduler.getReporter()?.onStart('test-spec');
    await flushAsync(1);
    expect(contextValue?.tasks[0].status).toBe('running');

    // Task updated with error
    state.tasks['TASK-001'].status = 'failed';
    state.tasks['TASK-001'].errors = ['Syntax error'];
    stateRepo.save(state);
    scheduler.getReporter()?.onUpdate('test-spec');
    await flushAsync(1);
    expect(contextValue?.tasks[0].status).toBe('failed');
    expect(contextValue?.tasks[0].errors).toEqual(['Syntax error']);

    // Task completed
    state.tasks['TASK-001'].status = 'completed';
    delete state.tasks['TASK-001'].errors;
    stateRepo.save(state);
    scheduler.getReporter()?.onComplete('test-spec');
    await flushAsync(1);
    expect(contextValue?.tasks[0].status).toBe('completed');
    expect(contextValue?.tasks[0].errors).toBeUndefined();

    unmount();
  });

  it('updates schedulerStatus in response to execution run events', async () => {
    let contextValue: ExecutionContextValue | null = null;
    const TestConsumer = () => {
      contextValue = useExecution();
      return <Text>Status: {contextValue.schedulerStatus}</Text>;
    };

    const { unmount } = renderWithProviders(<TestConsumer />, {
      container,
      scheduler,
      flushIntervalMs: 0,
    });

    await flushAsync(1);
    expect(contextValue?.schedulerStatus).toBe('idle');

    scheduler.getReporter()?.onStart('test-spec');
    await flushAsync(1);
    expect(contextValue?.schedulerStatus).toBe('running');

    scheduler.getReporter()?.onComplete('test-spec');
    await flushAsync(1);
    expect(contextValue?.schedulerStatus).toBe('completed');

    scheduler.getReporter()?.onFail('test-spec');
    await flushAsync(1);
    expect(contextValue?.schedulerStatus).toBe('failed');

    scheduler.getReporter()?.onDeadlock('test-spec');
    await flushAsync(1);
    expect(contextValue?.schedulerStatus).toBe('deadlock');

    unmount();
  });
});
