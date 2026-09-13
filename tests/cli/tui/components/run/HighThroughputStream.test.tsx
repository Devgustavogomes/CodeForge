import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunDashboard } from '../../../../../src/cli/tui/components/run/RunDashboard.js';
import {
  useExecution,
  ExecutionContextValue,
} from '../../../../../src/cli/tui/context/ExecutionContext.js';
import {
  resetSharedSpinnerTicker,
} from '../../../../../src/cli/tui/components/common/Spinner.js';
import { renderWithProviders, flushAsync } from '../../helpers/renderWithProviders.js';
import { InMemoryWorkspaceGateway } from '../../../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../../../helpers/in-memory-agent-runner.js';
import { ExecutionStateRepository } from '../../../../../src/infrastructure/repositories/ExecutionStateRepository.js';
import { createAppContainer } from '../../../../../src/infrastructure/container.js';
import { Task } from '../../../../../src/domain/task.js';

describe('High-Throughput Stream Integration', () => {
  beforeEach(() => {
    resetSharedSpinnerTicker();
  });

  afterEach(() => {
    resetSharedSpinnerTicker();
    vi.restoreAllMocks();
  });

  it('handles massive high-throughput log burst across concurrent tasks without losing chunks while throttling redraws', async () => {
    const gw = new InMemoryWorkspaceGateway();
    const runner = new InMemoryAgentRunner();
    const stateRepo = new ExecutionStateRepository(gw);
    const container = createAppContainer(gw, {
      runnerProvider: () => runner,
      executionStateRepository: stateRepo,
    });

    gw.mkdir('.codeforge/tasks/stream-spec');
    const taskDefs: Task[] = [
      {
        id: 'TASK-001',
        title: 'Task 1',
        dependencies: [],
        objective: 'Process stream A',
        context: '',
        implementation: '',
        files: [],
        constraints: [],
        acceptanceCriteria: [],
      },
      {
        id: 'TASK-002',
        title: 'Task 2',
        dependencies: [],
        objective: 'Process stream B',
        context: '',
        implementation: '',
        files: [],
        constraints: [],
        acceptanceCriteria: [],
      },
      {
        id: 'TASK-003',
        title: 'Task 3',
        dependencies: [],
        objective: 'Process stream C',
        context: '',
        implementation: '',
        files: [],
        constraints: [],
        acceptanceCriteria: [],
      },
    ];
    for (const t of taskDefs) {
      gw.writeFile(
        `.codeforge/tasks/stream-spec/${t.id}.json`,
        JSON.stringify(t),
      );
    }

    const scheduler = container.createTaskScheduler(runner, {
      environment: 'test',
      plannerAgent: 'mock',
      executorAgent: 'mock',
      language: 'en',
    });

    let execContext: ExecutionContextValue | null = null;
    const ContextCapture: React.FC = () => {
      execContext = useExecution();
      return <RunDashboard isInteractive={true} />;
    };

    const { frames, unmount } = renderWithProviders(<ContextCapture />, {
      container,
      scheduler,
      initialSpec: 'stream-spec',
      flushIntervalMs: 5,
    });

    await flushAsync(2);

    const reporter = scheduler.getReporter();
    expect(reporter).toBeDefined();

    const initialFrameCount = frames.length;

    const expectedLogsTask1: string[] = [];
    const expectedLogsTask2: string[] = [];
    const expectedLogsTask3: string[] = [];

    for (let i = 0; i < 20; i++) {
      const msg1 = `[INFO] T1-chunk-${i}: payload ${i * 7}`;
      const msg2 = `[WARN] T2-chunk-${i}: latency ${i * 3}ms`;
      const msg3 = `[INFO] T3-chunk-${i}: chunk verification`;

      expectedLogsTask1.push(msg1);
      expectedLogsTask2.push(msg2);
      expectedLogsTask3.push(msg3);

      reporter?.onLog?.('TASK-001', msg1);
      reporter?.onLog?.('TASK-002', msg2);
      reporter?.onLog?.('TASK-003', msg3);
    }

    await flushAsync(50);

    // Redraw containment: UI redraws during burst must be throttled and much lower than 60 chunks emitted
    const redrawsDuringBurst = frames.length - initialFrameCount;
    expect(redrawsDuringBurst).toBeLessThan(10);

    // Log integrity: zero lost logs
    const task1Logs = execContext!.getTaskLogs('TASK-001');
    const task2Logs = execContext!.getTaskLogs('TASK-002');
    const task3Logs = execContext!.getTaskLogs('TASK-003');

    expect(task1Logs).toHaveLength(20);
    expect(task2Logs).toHaveLength(20);
    expect(task3Logs).toHaveLength(20);

    expect(task1Logs).toEqual(expectedLogsTask1);
    expect(task2Logs).toEqual(expectedLogsTask2);
    expect(task3Logs).toEqual(expectedLogsTask3);

    unmount();
  });
});
