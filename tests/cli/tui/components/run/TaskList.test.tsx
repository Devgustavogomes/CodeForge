import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { TaskList, formatDuration } from '../../../../../src/cli/tui/components/run/TaskList.js';
import { TaskItem } from '../../../../../src/cli/tui/context/ExecutionContext.js';

describe('TaskList component', () => {
  const mockTasks: TaskItem[] = [
    {
      id: 'TASK-001',
      title: 'Initial setup',
      status: 'completed',
      dependencies: [],
      startedAt: '2026-09-06T10:00:00.000Z',
      completedAt: '2026-09-06T10:00:05.000Z',
    },
    {
      id: 'TASK-002',
      title: 'Build feature',
      status: 'running',
      dependencies: ['TASK-001'],
      startedAt: '2026-09-06T10:00:05.000Z',
    },
    {
      id: 'TASK-003',
      title: 'Run tests',
      status: 'failed',
      dependencies: ['TASK-002'],
      startedAt: '2026-09-06T10:00:10.000Z',
      completedAt: '2026-09-06T10:00:12.000Z',
      errors: ['Test failed'],
    },
    {
      id: 'TASK-004',
      title: 'Deploy to prod',
      status: 'pending',
      dependencies: ['TASK-003'],
    },
  ];

  it('renders task items with status icons, durations, IDs, and titles', () => {
    const { lastFrame } = render(
      <TaskList tasks={mockTasks} selectedTaskId="TASK-001" isFocused={false} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Tasks (4)');
    expect(output).toContain('TASK-001');
    expect(output).toContain('Initial setup');
    expect(output).toContain('✓'); // completed icon
    expect(output).toContain('5s'); // 5000ms duration

    expect(output).toContain('TASK-002');
    expect(output).toContain('Build feature');
    expect(output).toContain('▶'); // running icon

    expect(output).toContain('TASK-003');
    expect(output).toContain('Run tests');
    expect(output).toContain('✗'); // failed icon
    expect(output).toContain('2s'); // 2000ms duration

    expect(output).toContain('TASK-004');
    expect(output).toContain('Deploy to prod');
    expect(output).toContain('●'); // pending icon
  });

  it('renders filter badges with accurate counts', () => {
    const { lastFrame } = render(
      <TaskList tasks={mockTasks} selectedTaskId="TASK-001" showFilterBadges={true} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('[All: 4]');
    expect(output).toContain('[▶ Running: 1]');
    expect(output).toContain('[✗ Failed: 1]');
    expect(output).toContain('[✓ Done: 1]');
  });

  it('navigates through tasks via keyboard (down / up arrows)', () => {
    const onSelectTask = vi.fn();
    const { stdin } = render(
      <TaskList
        tasks={mockTasks}
        selectedTaskId="TASK-001"
        onSelectTask={onSelectTask}
        isFocused={true}
      />
    );

    // Down arrow to move to TASK-002
    stdin.write('\u001B[B');
    expect(onSelectTask).toHaveBeenCalledWith('TASK-002');

    // Key 'j' to move to next
    stdin.write('j');
    expect(onSelectTask).toHaveBeenCalledWith('TASK-002');
  });

  it('formats durations accurately', () => {
    expect(formatDuration(undefined, undefined)).toBe('-');
    expect(
      formatDuration('2026-09-06T10:00:00.000Z', '2026-09-06T10:00:00.500Z')
    ).toBe('500ms');
    expect(
      formatDuration('2026-09-06T10:00:00.000Z', '2026-09-06T10:00:15.000Z')
    ).toBe('15s');
    expect(
      formatDuration('2026-09-06T10:00:00.000Z', '2026-09-06T10:02:30.000Z')
    ).toBe('2m 30s');
  });
});
