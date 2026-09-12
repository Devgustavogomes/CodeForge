import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { TaskList, TaskFilter } from '../../../../../src/cli/tui/components/run/TaskList.js';
import { ExecutionContext, ExecutionContextValue, TaskItem } from '../../../../../src/cli/tui/context/ExecutionContext.js';
import { flushAsync } from '../../helpers/flushAsync.js';

const tasks: TaskItem[] = [
  { id: 'TASK-001', title: 'Pending task', status: 'pending', dependencies: [] },
];

function execution(): ExecutionContextValue {
  return {
    activeSpec: 'spec', tasks, selectedTaskId: 'TASK-001', selectedTask: tasks[0]!,
    status: 'idle', schedulerStatus: 'idle', logs: {}, getTaskLogs: vi.fn(() => []),
    setSelectedTaskId: vi.fn(), selectTask: vi.fn(), setActiveSpec: vi.fn(),
    startRun: vi.fn(), retryTask: vi.fn(), retryAllFailed: vi.fn(), completeTask: vi.fn(),
    resetTask: vi.fn(), resetAllTasks: vi.fn(), clearLogs: vi.fn(), scheduler: null,
  };
}

describe('TaskList', () => {
  it('keeps cycling when the current filter has no tasks', async () => {
    const onFilterChange = vi.fn();
    const { stdin, rerender } = render(
      <ExecutionContext.Provider value={execution()}>
        <TaskList tasks={tasks} filter="running" onFilterChange={onFilterChange} />
      </ExecutionContext.Provider>,
    );

    stdin.write('f');
    await flushAsync();
    expect(onFilterChange).toHaveBeenCalledWith('failed');

    rerender(
      <ExecutionContext.Provider value={execution()}>
        <TaskList tasks={tasks} filter="failed" onFilterChange={onFilterChange} />
      </ExecutionContext.Provider>,
    );
    stdin.write('f');
    await flushAsync();
    expect(onFilterChange).toHaveBeenLastCalledWith('completed');
  });

  it('completes the selected task from the list-owned c shortcut', async () => {
    const onCompleteTask = vi.fn();
    const { stdin } = render(
      <ExecutionContext.Provider value={execution()}>
        <TaskList tasks={tasks} onCompleteTask={onCompleteTask} />
      </ExecutionContext.Provider>,
    );

    stdin.write('c');
    await flushAsync();
    expect(onCompleteTask).toHaveBeenCalledOnce();
  });
});
