import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunDashboard } from '../../../../../src/cli/tui/components/run/RunDashboard.js';
import { LogStreamView, areLogStreamPropsEqual } from '../../../../../src/cli/tui/components/run/LogStreamView.js';
import {
  TaskItem,
  useExecution,
  ExecutionContextValue,
} from '../../../../../src/cli/tui/context/ExecutionContext.js';
import {
  getSharedSpinnerActiveTimerCount,
  resetSharedSpinnerTicker,
} from '../../../../../src/cli/tui/components/common/Spinner.js';
import { renderWithProviders, createMockContainer } from '../../helpers/renderWithProviders.js';
import { InMemoryWorkspaceGateway } from '../../../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../../../helpers/in-memory-agent-runner.js';
import { TaskScheduler } from '../../../../../src/scheduler/TaskScheduler.js';
import { ExecutionStateRepository } from '../../../../../src/infrastructure/repositories/ExecutionStateRepository.js';
import { createAppContainer } from '../../../../../src/infrastructure/container.js';
import { Task } from '../../../../../src/domain/task.js';

const tick = (ms = 70) => new Promise((resolve) => setTimeout(resolve, ms));

describe('High-Throughput Stream Integration (AC10)', () => {
  beforeEach(() => {
    resetSharedSpinnerTicker();
  });

  afterEach(() => {
    resetSharedSpinnerTicker();
    vi.restoreAllMocks();
  });

  it('handles massive high-throughput log burst across concurrent tasks without losing chunks while keeping redraw count significantly lower than chunk count', async () => {
    const gw = new InMemoryWorkspaceGateway();
    const runner = new InMemoryAgentRunner();
    const stateRepo = new ExecutionStateRepository(gw);
    const container = createAppContainer(gw, {
      runnerProvider: () => runner,
      executionStateRepository: stateRepo,
    });

    // Create 3 concurrent tasks in spec
    gw.mkdir('.codeforge/tasks/stream-spec');
    const taskDefs: Task[] = [
      { id: 'TASK-001', title: 'Task 1', dependencies: [], objective: 'Process stream A' },
      { id: 'TASK-002', title: 'Task 2', dependencies: [], objective: 'Process stream B' },
      { id: 'TASK-003', title: 'Task 3', dependencies: [], objective: 'Process stream C' },
    ];
    for (const t of taskDefs) {
      gw.writeFile(`.codeforge/tasks/stream-spec/${t.id}.json`, JSON.stringify(t));
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
      return (
        <RunDashboard
          breakpoint="wide"
          isInteractive={true}
        />
      );
    };

    // Render with 60ms batching flush interval
    const { frames, unmount } = renderWithProviders(<ContextCapture />, {
      container,
      scheduler,
      initialSpec: 'stream-spec',
      flushIntervalMs: 60,
    });

    await tick(30);

    const reporter = scheduler.getReporter();
    expect(reporter).toBeDefined();

    // Record initial frame count after mount
    const initialFrameCount = frames.length;

    // Simulate high-frequency streaming: 150 chunks emitted in rapid succession across 3 tasks
    const TOTAL_CHUNKS = 150;
    const expectedLogsTask1: string[] = [];
    const expectedLogsTask2: string[] = [];
    const expectedLogsTask3: string[] = [];

    for (let i = 0; i < 50; i++) {
      const msg1 = `[INFO] T1-chunk-${i}: payload ${i * 7}`;
      const msg2 = `[WARN] T2-chunk-${i}: processing latency ${i * 3}ms`;
      const msg3 = `[INFO] T3-chunk-${i}: data chunk verification`;

      expectedLogsTask1.push(msg1);
      expectedLogsTask2.push(msg2);
      expectedLogsTask3.push(msg3);

      reporter?.onLog?.('TASK-001', msg1);
      reporter?.onLog?.('TASK-002', msg2);
      reporter?.onLog?.('TASK-003', msg3);
    }

    // Wait for the buffering flush cycle to complete
    await tick(120);

    // 1. Redraw containment: UI redraws during the burst must be significantly fewer than the 150 chunks emitted
    const redrawsDuringBurst = frames.length - initialFrameCount;
    expect(redrawsDuringBurst).toBeLessThan(25); // ~1-3 batch flushes instead of 150 individual redraws

    // 2. Log integrity: Zero lost logs
    const task1Logs = execContext!.getTaskLogs('TASK-001');
    const task2Logs = execContext!.getTaskLogs('TASK-002');
    const task3Logs = execContext!.getTaskLogs('TASK-003');

    expect(task1Logs).toHaveLength(50);
    expect(task2Logs).toHaveLength(50);
    expect(task3Logs).toHaveLength(50);

    // Verify 100% of exact message strings match
    expect(task1Logs).toEqual(expectedLogsTask1);
    expect(task2Logs).toEqual(expectedLogsTask2);
    expect(task3Logs).toEqual(expectedLogsTask3);

    unmount();
  });

  it('prevents background task log updates from triggering re-renders in LogStreamView when another task is selected', async () => {
    // Test memoization behavior with areLogStreamPropsEqual
    const initialLogsTask1 = ['[INFO] Task 1 started', '[INFO] Task 1 compiling'];
    const initialLogsTask2 = ['[INFO] Task 2 started'];

    const prevProps = {
      taskId: 'TASK-001',
      logs: initialLogsTask1,
      isFocused: false,
      maxVisibleLines: 8,
      autoScroll: true,
      defaultWrap: false,
      borderStyle: 'round' as const,
    };

    // When background task TASK-002 receives new logs, TASK-001's logs are unchanged
    const nextPropsBackgroundUpdate = {
      ...prevProps,
      logs: initialLogsTask1, // identical reference for TASK-001
    };

    expect(areLogStreamPropsEqual(prevProps, nextPropsBackgroundUpdate)).toBe(true);

    // If TASK-001 itself receives logs, it detects the change
    const nextPropsSelfUpdate = {
      ...prevProps,
      logs: [...initialLogsTask1, '[SUCCESS] Task 1 completed'],
    };

    expect(areLogStreamPropsEqual(prevProps, nextPropsSelfUpdate)).toBe(false);

    // If user switches selection to TASK-002, it detects the task switch
    const nextPropsTaskSwitch = {
      ...prevProps,
      taskId: 'TASK-002',
      logs: initialLogsTask2,
    };

    expect(areLogStreamPropsEqual(prevProps, nextPropsTaskSwitch)).toBe(false);
  });

  it('enforces strict height and layout containment during intense log streaming with long lines', async () => {
    const mockTasks: TaskItem[] = [
      {
        id: 'TASK-001',
        title: 'High Volume Task',
        status: 'running',
        dependencies: [],
        objective: 'Objective text for layout test',
      },
    ];

    // Generate burst with very long lines (simulating stack traces and minified outputs)
    const longLines = Array.from({ length: 40 }, (_, idx) =>
      `[TRACE-${idx}] ${'x'.repeat(180)} end-of-trace-${idx}`
    );

    const { lastFrame, unmount } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={mockTasks}
        selectedTaskId="TASK-001"
        selectedTask={mockTasks[0]}
        logs={{ 'TASK-001': longLines }}
        isInteractive={false}
      />,
    );

    const output = lastFrame() ?? '';

    // Verify task details and log view are present
    expect(output).toContain('TASK-001');
    expect(output).toContain('Logs: TASK-001');
    expect(output).toContain('40 lines');

    // Verify terminal lines output does not explode beyond 24 lines budget
    const lineCount = output.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(24);

    unmount();
  });

  it('handles task retry after failure with fresh log stream accumulation', async () => {
    const onRetryTaskSpy = vi.fn();
    const failedTasks: TaskItem[] = [
      {
        id: 'TASK-001',
        title: 'Failing Task',
        status: 'failed',
        dependencies: [],
        objective: 'Task that failed previously',
        errors: ['Error: build failure on step 4'],
      },
    ];

    const initialLogs = ['[INFO] Starting build...', '[ERROR] Process failed'];

    const { lastFrame, stdin, rerender, unmount } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={failedTasks}
        selectedTaskId="TASK-001"
        selectedTask={failedTasks[0]}
        logs={{ 'TASK-001': initialLogs }}
        onRetryTask={onRetryTaskSpy}
        isInteractive={true}
      />,
    );

    expect(lastFrame()).toContain('[FAILED]');
    expect(lastFrame()).toContain('Error: build failure on step 4');

    // Press 'r' to trigger retry
    stdin.write('r');
    await tick(30);

    expect(onRetryTaskSpy).toHaveBeenCalledWith('TASK-001');

    // Simulate task status reset to running with new log chunks streaming in
    const retriedTasks: TaskItem[] = [
      {
        id: 'TASK-001',
        title: 'Failing Task',
        status: 'running',
        dependencies: [],
        objective: 'Task that failed previously',
      },
    ];

    const updatedLogs = [
      ...initialLogs,
      '[INFO] Retrying task...',
      '[INFO] Cleaned cache directory',
      '[SUCCESS] Rebuild succeeded',
    ];

    rerender(
      <RunDashboard
        breakpoint="wide"
        tasks={retriedTasks}
        selectedTaskId="TASK-001"
        selectedTask={retriedTasks[0]}
        logs={{ 'TASK-001': updatedLogs }}
        isInteractive={true}
      />,
    );

    const updatedOutput = lastFrame() ?? '';
    expect(updatedOutput).toContain('[RUNNING]');
    expect(updatedOutput).toContain('[SUCCESS] Rebuild succeeded');
    expect(updatedOutput).toContain('5 lines');

    unmount();
  });

  it('cleans up all resources, spinner tickers, and timers on TUI unmount without residual active handles', async () => {
    const runningTasks: TaskItem[] = [
      {
        id: 'TASK-001',
        title: 'Long Running Task 1',
        status: 'running',
        dependencies: [],
      },
      {
        id: 'TASK-002',
        title: 'Long Running Task 2',
        status: 'running',
        dependencies: [],
      },
    ];

    const { unmount } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={runningTasks}
        selectedTaskId="TASK-001"
        schedulerStatus="running"
        isInteractive={false}
      />,
    );

    // Verify shared spinner ticker is active while running
    expect(getSharedSpinnerActiveTimerCount()).toBeGreaterThan(0);

    // Unmount the dashboard
    unmount();

    // Verify all shared timers are cleaned up immediately on unmount
    expect(getSharedSpinnerActiveTimerCount()).toBe(0);
  });
});
