import React from 'react';
import { act } from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  ExecutionContext,
  ExecutionContextValue,
  TaskItem,
} from '../../../../../../src/cli/tui/context/ExecutionContext.js';
import { useRunDashboard } from '../../../../../../src/cli/tui/components/run/hooks/useRunDashboard.js';

type DashboardState = ReturnType<typeof useRunDashboard>;

function task(id: string, status: TaskItem['status']): TaskItem {
  return { id, title: id, status, dependencies: [] };
}

function createExecution(overrides: Partial<ExecutionContextValue> = {}): ExecutionContextValue {
  return {
    activeIntent: 'intent-ativa',
    tasks: [task('TASK-1', 'failed')],
    selectedTaskId: 'TASK-1',
    selectedTask: null,
    status: 'idle',
    schedulerStatus: 'idle',
    logs: { 'TASK-1': ['erro anterior'] },
    getTaskLogs: vi.fn((id: string) => id === 'TASK-1' ? ['erro anterior'] : []),
    setSelectedTaskId: vi.fn(),
    selectTask: vi.fn(),
    setActiveIntent: vi.fn(),
    startRun: vi.fn().mockResolvedValue(undefined),
    retryTask: vi.fn().mockResolvedValue(undefined),
    retryAllFailed: vi.fn().mockResolvedValue(undefined),
    completeTask: vi.fn().mockResolvedValue(undefined),
    resetTask: vi.fn().mockResolvedValue(undefined),
    resetAllTasks: vi.fn().mockResolvedValue(undefined),
    clearLogs: vi.fn(),
    scheduler: null,
    ...overrides,
  };
}

function renderHook(execution = createExecution()) {
  let current!: DashboardState;
  const Harness = () => {
    current = useRunDashboard();
    return <Text>run</Text>;
  };
  const result = render(
    <ExecutionContext.Provider value={execution}>
      <Harness />
    </ExecutionContext.Provider>,
  );
  return { execution, result, get current() { return current; } };
}

afterEach(() => vi.useRealTimers());

describe('useRunDashboard', () => {
  it('executa retry individual na ordem mutação e scheduler somente para task failed', async () => {
    const hook = renderHook();

    await act(async () => { await hook.current.onRetryTask(); });

    expect(hook.execution.retryTask).toHaveBeenCalledWith('TASK-1', 'intent-ativa');
    expect(hook.execution.startRun).toHaveBeenCalledWith('intent-ativa');
    expect(vi.mocked(hook.execution.retryTask).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(hook.execution.startRun).mock.invocationCallOrder[0]);
    expect(hook.current.actionFeedback).toBe('✓ Task TASK-1 retried — scheduler resuming');

    const pending = renderHook(createExecution({ tasks: [task('TASK-1', 'pending')] }));
    await act(async () => { await pending.current.onRetryTask(); });
    expect(pending.execution.retryTask).not.toHaveBeenCalled();
    expect(pending.execution.startRun).not.toHaveBeenCalled();
  });

  it('conta falhas antes do retry global e não executa nada quando não há falhas', async () => {
    const hook = renderHook(createExecution({
      tasks: [task('TASK-1', 'failed'), task('TASK-2', 'failed'), task('TASK-3', 'pending')],
    }));

    await act(async () => { await hook.current.onRetryAllFailed(); });

    expect(hook.execution.retryAllFailed).toHaveBeenCalledTimes(1);
    expect(hook.execution.startRun).toHaveBeenCalledWith('intent-ativa');
    expect(hook.current.actionFeedback).toBe('✓ 2 failed tasks retried — scheduler resuming');

    const withoutFailures = renderHook(createExecution({ tasks: [task('TASK-1', 'pending')] }));
    await act(async () => { await withoutFailures.current.onRetryAllFailed(); });
    expect(withoutFailures.execution.retryAllFailed).not.toHaveBeenCalled();
    expect(withoutFailures.execution.startRun).not.toHaveBeenCalled();
    expect(withoutFailures.current.actionFeedback).toBe('Nenhuma task falhou');
  });

  it('reinicia somente reset global e ignora conclusão de task completed', async () => {
    const hook = renderHook();

    await act(async () => { await hook.current.onResetAllTasks(); });
    expect(hook.execution.resetAllTasks).toHaveBeenCalledWith('intent-ativa');
    expect(hook.execution.startRun).toHaveBeenCalledWith('intent-ativa');
    expect(vi.mocked(hook.execution.resetAllTasks).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(hook.execution.startRun).mock.invocationCallOrder[0]);

    await act(async () => { await hook.current.onResetTask(); });
    expect(hook.execution.resetTask).toHaveBeenCalledWith('TASK-1', 'intent-ativa');
    expect(hook.execution.startRun).toHaveBeenCalledTimes(1);

    const completed = renderHook(createExecution({ tasks: [task('TASK-1', 'completed')] }));
    await act(async () => { await completed.current.onCompleteTask(); });
    expect(completed.execution.completeTask).not.toHaveBeenCalled();
    expect(completed.execution.startRun).not.toHaveBeenCalled();
  });

  it('limpa a intent, alterna painéis e expira ou substitui o feedback', async () => {
    vi.useFakeTimers();
    const hook = renderHook();

    expect(hook.current.focusedPanel).toBe('tasks');
    act(() => hook.current.onTogglePanel());
    expect(hook.current.focusedPanel).toBe('logs');
    act(() => hook.current.onFocusTasks());
    expect(hook.current.focusedPanel).toBe('tasks');

    await act(async () => { await hook.current.onResetTask(); });
    expect(hook.current.actionFeedback).toBe('✓ Task TASK-1 reset to pending');
    await act(async () => { await hook.current.onCompleteTask(); });
    expect(hook.current.actionFeedback).toBe('✓ Task TASK-1 marked as completed');
    await act(async () => { await vi.advanceTimersByTimeAsync(3500); });
    expect(hook.current.actionFeedback).toBeNull();

    act(() => hook.current.onSelectIntent());
    expect(hook.execution.setActiveIntent).toHaveBeenCalledWith(null);
  });
});
