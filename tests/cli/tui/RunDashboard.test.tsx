import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { RunDashboard, renderProgressBar } from '../../../src/cli/tui/components/run/RunDashboard.js';
import { TaskItem } from '../../../src/cli/tui/context/ExecutionContext.js';

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
    const { lastFrame } = render(
      <RunDashboard
        breakpoint="wide"
        tasks={mockTasks}
        selectedTaskId="TASK-002"
        selectedTask={mockTasks[1]}
        isInteractive={false}
      />
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
    const { lastFrame, stdin } = render(
      <RunDashboard
        breakpoint="compact"
        tasks={mockTasks}
        selectedTaskId="TASK-001"
        selectedTask={mockTasks[0]}
        defaultFocusedPanel="tasks"
        isInteractive={true}
      />
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
    const { lastFrame } = render(
      <RunDashboard
        breakpoint="minimal"
        tasks={mockTasks}
        selectedTaskId="TASK-001"
        selectedTask={mockTasks[0]}
        isInteractive={false}
      />
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

    const { stdin } = render(
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
      />
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
});
