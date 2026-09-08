import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TaskList,
  areTaskRowPropsEqual,
  formatDuration,
} from '../../../../../src/cli/tui/components/run/TaskList.js';
import { TaskItem } from '../../../../../src/cli/tui/context/ExecutionContext.js';
import {
  SPINNER_FRAMES,
  resetSharedSpinnerTicker,
} from '../../../../../src/cli/tui/components/common/Spinner.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TaskList component', () => {
  beforeEach(() => {
    resetSharedSpinnerTicker();
  });

  afterEach(() => {
    resetSharedSpinnerTicker();
  });
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
    const { lastFrame } = renderWithProviders(
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
    expect(output).toContain(SPINNER_FRAMES[0]); // live spinner on running task

    expect(output).toContain('TASK-003');
    expect(output).toContain('Run tests');
    expect(output).toContain('✗'); // failed icon
    expect(output).toContain('2s'); // 2000ms duration

    expect(output).toContain('TASK-004');
    expect(output).toContain('Deploy to prod');
    expect(output).toContain('●'); // pending icon
  });

  it('renders live spinner on running tasks that updates animation frame', async () => {
    const { lastFrame } = renderWithProviders(
      <TaskList
        tasks={[
          {
            id: 'TASK-001',
            title: 'Running task',
            status: 'running',
            dependencies: [],
            startedAt: new Date().toISOString(),
          },
        ]}
      />
    );

    expect(lastFrame()).toContain(SPINNER_FRAMES[0]);
    let advanced = false;
    for (let i = 0; i < 20; i++) {
      await sleep(25);
      if (lastFrame()?.includes(SPINNER_FRAMES[1])) {
        advanced = true;
        break;
      }
    }
    expect(advanced).toBe(true);
  });

  it('ticks dynamic elapsed duration for running tasks', async () => {
    // Started 2 seconds ago
    const startTime = new Date(Date.now() - 2000).toISOString();
    const { lastFrame } = renderWithProviders(
      <TaskList
        tasks={[
          {
            id: 'TASK-LIVE',
            title: 'Long running task',
            status: 'running',
            dependencies: [],
            startedAt: startTime,
          },
        ]}
      />
    );

    const initial = lastFrame() ?? '';
    expect(initial).toMatch(/[23]s/);

    await sleep(1050);
    const afterTick = lastFrame() ?? '';
    expect(afterTick).toMatch(/[34]s/);
  });

  it('renders filter badges with accurate counts', () => {
    const { lastFrame } = renderWithProviders(
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
    const { stdin } = renderWithProviders(
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
    expect(
      formatDuration('2026-09-06T10:00:00.000Z', '2026-09-06T11:02:30.000Z')
    ).toBe('1h 2m 30s');
  });

  describe('areTaskRowPropsEqual comparator', () => {
    const baseTask: TaskItem = {
      id: 'TASK-001',
      title: 'Setup task',
      status: 'completed',
      dependencies: [],
      startedAt: '2026-09-06T10:00:00.000Z',
      completedAt: '2026-09-06T10:00:05.000Z',
    };

    it('returns true when references and values are identical', () => {
      const prev = { task: baseTask, isSelected: false, isFocused: true };
      const next = { task: baseTask, isSelected: false, isFocused: true };
      expect(areTaskRowPropsEqual(prev, next)).toBe(true);
    });

    it('returns true when task object is a clone with equal fields', () => {
      const prev = { task: baseTask, isSelected: true, isFocused: true };
      const next = {
        task: { ...baseTask, errors: ['different errors but ignored in row'] },
        isSelected: true,
        isFocused: true,
      };
      expect(areTaskRowPropsEqual(prev, next)).toBe(true);
    });

    it('returns false when isSelected changes', () => {
      const prev = { task: baseTask, isSelected: false, isFocused: true };
      const next = { task: baseTask, isSelected: true, isFocused: true };
      expect(areTaskRowPropsEqual(prev, next)).toBe(false);
    });

    it('returns false when isFocused changes', () => {
      const prev = { task: baseTask, isSelected: true, isFocused: false };
      const next = { task: baseTask, isSelected: true, isFocused: true };
      expect(areTaskRowPropsEqual(prev, next)).toBe(false);
    });

    it('returns false when task status changes', () => {
      const prev = { task: baseTask, isSelected: false, isFocused: false };
      const next = {
        task: { ...baseTask, status: 'running' as const },
        isSelected: false,
        isFocused: false,
      };
      expect(areTaskRowPropsEqual(prev, next)).toBe(false);
    });

    it('returns false when task title changes', () => {
      const prev = { task: baseTask, isSelected: false, isFocused: false };
      const next = {
        task: { ...baseTask, title: 'Updated Title' },
        isSelected: false,
        isFocused: false,
      };
      expect(areTaskRowPropsEqual(prev, next)).toBe(false);
    });

    it('returns false when startedAt changes', () => {
      const prev = { task: baseTask, isSelected: false, isFocused: false };
      const next = {
        task: { ...baseTask, startedAt: '2026-09-06T10:00:01.000Z' },
        isSelected: false,
        isFocused: false,
      };
      expect(areTaskRowPropsEqual(prev, next)).toBe(false);
    });

    it('returns false when completedAt changes', () => {
      const prev = { task: baseTask, isSelected: false, isFocused: false };
      const next = {
        task: { ...baseTask, completedAt: '2026-09-06T10:00:10.000Z' },
        isSelected: false,
        isFocused: false,
      };
      expect(areTaskRowPropsEqual(prev, next)).toBe(false);
    });
  });

  it('preserves TaskRow rendering and isolates active spinner without affecting other rows', async () => {
    const tasks: TaskItem[] = [
      {
        id: 'TASK-DONE',
        title: 'Finished work',
        status: 'completed',
        dependencies: [],
        startedAt: '2026-09-06T10:00:00.000Z',
        completedAt: '2026-09-06T10:00:10.000Z',
      },
      {
        id: 'TASK-ACTIVE',
        title: 'In progress work',
        status: 'running',
        dependencies: [],
        startedAt: new Date().toISOString(),
      },
    ];

    const { lastFrame, unmount } = renderWithProviders(
      <TaskList tasks={tasks} selectedTaskId="TASK-DONE" isFocused={true} />
    );

    const initial = lastFrame() ?? '';
    expect(initial).toContain('TASK-DONE');
    expect(initial).toContain('✓');
    expect(initial).toContain('10s');
    expect(initial).toContain('TASK-ACTIVE');
    expect(initial).toContain(SPINNER_FRAMES[0]);

    // Advance timer to let spinner tick
    for (let i = 0; i < 20; i++) {
      await sleep(25);
      if (lastFrame()?.includes(SPINNER_FRAMES[1])) break;
    }

    const afterTick = lastFrame() ?? '';
    // Completed task row remains intact and unchanged
    expect(afterTick).toContain('TASK-DONE');
    expect(afterTick).toContain('✓');
    expect(afterTick).toContain('10s');
    // Active task row has updated spinner
    expect(afterTick).toContain(SPINNER_FRAMES[1]);

    unmount();
  });
});

