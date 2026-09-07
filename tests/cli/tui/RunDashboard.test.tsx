import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { RunDashboard, renderProgressBar } from '../../../src/cli/tui/components/run/RunDashboard.js';
import { TaskItem } from '../../../src/cli/tui/context/ExecutionContext.js';
import { renderWithProviders, createMockContainer } from './helpers/renderWithProviders.js';
import { PATHS } from '../../../src/infrastructure/paths.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('RunDashboard component', () => {
  const mockTasks: TaskItem[] = [
    {
      id: 'TASK-001',
      title: 'Initialize repository',
      status: 'completed',
      dependencies: [],
      objective: 'Set up base workspace configuration',
      files: ['package.json'],
      startedAt: '2026-09-06T10:00:00.000Z',
      completedAt: '2026-09-06T10:00:05.000Z',
    },
    {
      id: 'TASK-002',
      title: 'Implement feature',
      status: 'failed',
      dependencies: ['TASK-001'],
      objective: 'Core business logic implementation',
      files: ['src/index.ts'],
      startedAt: '2026-09-06T10:00:05.000Z',
      completedAt: '2026-09-06T10:00:10.000Z',
      errors: ['TypeError: Cannot read property undefined'],
    },
  ];

  it('renders Wide layout with 2 columns: TaskList on left, TaskDetails & LogStreamView on right', () => {
    const { lastFrame } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={mockTasks}
        selectedTaskId="TASK-002"
        selectedTask={mockTasks[1]}
        isInteractive={false}
      />,
    );
    const output = lastFrame() ?? '';

    // Left column: TaskList
    expect(output).toContain('Tasks (2)');
    expect(output).toContain('TASK-001');
    expect(output).toContain('TASK-002');

    // Right column: TaskDetails
    expect(output).toContain('Core business logic implementation');
    expect(output).toContain('[FAILED]');
    expect(output).toContain('TypeError: Cannot read property undefined');

    // Right column: LogStreamView
    expect(output).toContain('Logs: TASK-002');
  });

  it('renders Compact layout with single column and toggles with Tab key', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <RunDashboard
        breakpoint="compact"
        tasks={mockTasks}
        selectedTaskId="TASK-001"
        selectedTask={mockTasks[0]}
        defaultFocusedPanel="tasks"
        isInteractive={true}
      />,
    );

    // Initially in Tasks view
    let output = lastFrame() ?? '';
    expect(output).toContain('[Tasks]');
    expect(output).toContain('Tasks (2)');

    // Press Tab to switch view to Logs & Details
    stdin.write('\t');
    await tick();

    output = lastFrame() ?? '';
    expect(output).toContain('[Logs & Details]');
    expect(output).toContain('Logs: TASK-001');
    expect(output).toContain('Set up base workspace configuration');

    // Press Tab again to toggle back to Tasks view
    stdin.write('\t');
    await tick();

    output = lastFrame() ?? '';
    expect(output).toContain('Tasks (2)');
  });

  it('renders Minimal layout with compact progress bar and resize advisory', () => {
    const { lastFrame } = renderWithProviders(
      <RunDashboard
        breakpoint="minimal"
        tasks={mockTasks}
        selectedTaskId="TASK-001"
        selectedTask={mockTasks[0]}
        isInteractive={false}
      />,
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Run [Minimal]');
    expect(output).toContain('Window too small');
    expect(output).toContain('Please resize window to at least 60x12');
    expect(output).toContain('50%'); // 1 of 2 completed = 50%
  });

  it('triggers hotkeys r, R, c, x for runtime actions without quitting', async () => {
    const onRetryTask = vi.fn();
    const onRetryAllFailed = vi.fn();
    const onCompleteTask = vi.fn();
    const onResetTask = vi.fn();

    const { stdin } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={mockTasks}
        selectedTaskId="TASK-002"
        selectedTask={mockTasks[1]}
        onRetryTask={onRetryTask}
        onRetryAllFailed={onRetryAllFailed}
        onCompleteTask={onCompleteTask}
        onResetTask={onResetTask}
        isInteractive={true}
      />,
    );

    // Test 'r' -> retry selected task
    stdin.write('r');
    await tick();
    expect(onRetryTask).toHaveBeenCalledWith('TASK-002');

    // Test 'R' -> retry all failed
    stdin.write('R');
    await tick();
    expect(onRetryAllFailed).toHaveBeenCalled();

    // Test 'c' -> complete task
    stdin.write('c');
    await tick();
    expect(onCompleteTask).toHaveBeenCalledWith('TASK-002');

    // Test 'x' -> reset task
    stdin.write('x');
    await tick();
    expect(onResetTask).toHaveBeenCalledWith('TASK-002');
  });

  it('formats progress bar accurately in renderProgressBar helper', () => {
    expect(renderProgressBar(0, 0)).toBe('[░░░░░░░░░░░░░░░░░░░░] 0% (0/0)');
    expect(renderProgressBar(2, 4, 10)).toBe('[█████░░░░░] 50% (2/4)');
    expect(renderProgressBar(4, 4, 10)).toBe('[██████████] 100% (4/4)');
  });

  it('renders live metrics panel during execution with spec name, live spinner, and accurate counters', () => {
    const runningTasks: TaskItem[] = [
      {
        id: 'TASK-001',
        title: 'Task 1',
        status: 'completed',
        dependencies: [],
        startedAt: '2026-09-06T10:00:00.000Z',
        completedAt: '2026-09-06T10:00:10.000Z',
      },
      {
        id: 'TASK-002',
        title: 'Task 2',
        status: 'running',
        dependencies: [],
        startedAt: '2026-09-06T10:00:10.000Z',
      },
      {
        id: 'TASK-003',
        title: 'Task 3',
        status: 'pending',
        dependencies: [],
      },
    ];

    const { lastFrame } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={runningTasks}
        specName="core-engine"
        schedulerStatus="running"
        isInteractive={false}
      />,
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('⚡ Running [core-engine]');
    expect(output).toContain('⏱ Time:');
    expect(output).toContain('Parallel: 1');
    expect(output).toContain('✓ Completed: 1');
    expect(output).toContain('✗ Failed: 0');
    expect(output).toContain('⏳ Remaining: 1');
    expect(output).toContain('33% (1/3)');
  });

  it('renders Success Banner when execution state is completed with total time, 0 failures and shortcut hints', () => {
    const completedTasks: TaskItem[] = [
      {
        id: 'TASK-001',
        title: 'Task 1',
        status: 'completed',
        dependencies: [],
        startedAt: '2026-09-06T10:00:00.000Z',
        completedAt: '2026-09-06T10:01:00.000Z',
      },
      {
        id: 'TASK-002',
        title: 'Task 2',
        status: 'completed',
        dependencies: [],
        startedAt: '2026-09-06T10:01:00.000Z',
        completedAt: '2026-09-06T10:02:15.000Z',
      },
    ];

    const { lastFrame } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={completedTasks}
        specName="core-engine"
        schedulerStatus="completed"
        isInteractive={false}
      />,
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('✓ Execution Completed Successfully');
    expect(output).toContain('⏱ Total Time:');
    expect(output).toContain('✓ 2/2 tasks completed');
    expect(output).toContain('0 failures');
    expect(output).toContain('[s] Choose another spec');
    expect(output).toContain('[Tab] Inspect logs');
  });

  it('renders Failure Banner when execution state is failed or deadlock with shortcuts', () => {
    const failedTasks: TaskItem[] = [
      {
        id: 'TASK-001',
        title: 'Task 1',
        status: 'completed',
        dependencies: [],
        startedAt: '2026-09-06T10:00:00.000Z',
        completedAt: '2026-09-06T10:00:30.000Z',
      },
      {
        id: 'TASK-002',
        title: 'Task 2',
        status: 'failed',
        dependencies: [],
        startedAt: '2026-09-06T10:00:30.000Z',
        completedAt: '2026-09-06T10:00:45.000Z',
        errors: ['Compilation failed'],
      },
      {
        id: 'TASK-003',
        title: 'Task 3',
        status: 'pending',
        dependencies: ['TASK-002'],
      },
    ];

    const { lastFrame } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={failedTasks}
        specName="core-engine"
        schedulerStatus="failed"
        isInteractive={false}
      />,
    );
    let output = lastFrame() ?? '';

    expect(output).toContain('✗ Execution Finished with Failures');
    expect(output).toContain('⏱ Total Time:');
    expect(output).toContain('✓ 1 completed');
    expect(output).toContain('✗ 1 failure');
    expect(output).toContain('⏳ 1 remaining');
    expect(output).toContain('[R] Retry all failed');
    expect(output).toContain('[r] Retry selected');
    expect(output).toContain('[s] Specs');

    // Deadlock banner
    const { lastFrame: lastFrameDeadlock } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={failedTasks}
        specName="core-engine"
        schedulerStatus="deadlock"
        isInteractive={false}
      />,
    );
    output = lastFrameDeadlock() ?? '';
    expect(output).toContain('✗ Execution Finished with Failures');
    expect(output).toContain('[R] Retry all failed');
  });

  it('renders top metrics panel above panel views in both compact and wide layouts', () => {
    const { lastFrame: wideFrame } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={mockTasks}
        specName="test-spec"
        isInteractive={false}
      />,
    );
    expect(wideFrame()).toContain('test-spec');
    const { lastFrame: compactFrame } = renderWithProviders(
      <RunDashboard
        breakpoint="compact"
        tasks={mockTasks}
        specName="test-spec"
        isInteractive={false}
      />,
    );
    expect(compactFrame()).toContain('test-spec');
    expect(compactFrame()).toContain('Parallel:');
    expect(compactFrame()).toContain('Completed:');
  });

  it('triggers onStartRun when pressing Enter or Space while idle with pending tasks', async () => {
    const onStartRunSpy = vi.fn();
    const idleTasks: TaskItem[] = [
      { id: 'TASK-001', title: 'Task 1', status: 'pending', dependencies: [] },
    ];

    const { stdin } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={idleTasks}
        specName="my-spec"
        schedulerStatus="idle"
        onStartRun={onStartRunSpy}
        isInteractive={true}
      />,
    );

    stdin.write('\r');
    await tick();

    expect(onStartRunSpy).toHaveBeenCalledTimes(1);
    expect(onStartRunSpy).toHaveBeenCalledWith('my-spec');

    stdin.write(' ');
    await tick();

    expect(onStartRunSpy).toHaveBeenCalledTimes(2);
  });

  it('triggers onResetAllTasks when pressing X (Shift+X)', async () => {
    const onResetAllTasksSpy = vi.fn();

    const { stdin } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={mockTasks}
        specName="my-spec"
        schedulerStatus="completed"
        onResetAllTasks={onResetAllTasksSpy}
        isInteractive={true}
      />,
    );

    stdin.write('X');
    await tick();

    expect(onResetAllTasksSpy).toHaveBeenCalledTimes(1);
  });

  it('renders SpecPicker when no tasks are present in workspace', () => {
    const container = createMockContainer();
    const { lastFrame } = renderWithProviders(
      <RunDashboard
        tasks={[]}
        isInteractive={false}
      />,
      { container },
    );

    const output = lastFrame() ?? '';
    expect(output).toContain('Welcome to CodeForge');
    expect(output).toContain('No specifications found');
    expect(output).toContain('[c] Create new spec');
  });

  it('renders SpecPicker with available specs when specs exist in workspace', async () => {
    const container = createMockContainer();
    container.workspaceGateway.writeFile(`${PATHS.specsDir}/spec-auth.md`, '# Authentication Spec\nDetails');

    const { lastFrame } = renderWithProviders(
      <RunDashboard
        tasks={[]}
        isInteractive={false}
      />,
      { container },
    );
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('Select a Specification');
    expect(output).toContain('spec-auth');
    expect(output).toContain('Authentication Spec');
  });

  it('selects and runs a spec from SpecPicker when Enter is pressed', async () => {
    const container = createMockContainer();
    container.workspaceGateway.writeFile(`${PATHS.specsDir}/spec-auth.md`, '# Authentication Spec\nDetails');
    const onSelectSpec = vi.fn();

    const { stdin } = renderWithProviders(
      <RunDashboard
        tasks={[]}
        isInteractive={true}
        onSelectSpec={onSelectSpec}
      />,
      { container },
    );
    await tick();

    stdin.write('\r');
    await tick();

    expect(onSelectSpec).toHaveBeenCalled();
  });
});
