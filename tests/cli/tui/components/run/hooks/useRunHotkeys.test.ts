import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { useRunHotkeys, UseRunHotkeysProps } from '../../../../../../src/cli/tui/components/run/hooks/useRunHotkeys.js';
import { flushAsync } from '../../../helpers/flushAsync.js';

type HarnessProps = Partial<UseRunHotkeysProps>;

const Harness: React.FC<HarnessProps> = (props) => {
  useRunHotkeys({
    isInteractive: props.isInteractive, isModalOpen: props.isModalOpen, isTextInputActive: props.isTextInputActive,
    focusedPanel: props.focusedPanel ?? 'tasks',
    selectedTaskId: props.selectedTaskId !== undefined ? props.selectedTaskId : 'TASK-001',
    selectedTaskStatus: props.selectedTaskStatus !== undefined ? props.selectedTaskStatus : 'failed',
    effectiveStatus: props.effectiveStatus ?? 'idle',
    onTogglePanel: props.onTogglePanel ?? vi.fn(), onStartRun: props.onStartRun ?? vi.fn(),
    onRetryTask: props.onRetryTask ?? vi.fn(), onRetryAllFailed: props.onRetryAllFailed ?? vi.fn(),
    onResetTask: props.onResetTask ?? vi.fn(),
    onResetAllTasks: props.onResetAllTasks ?? vi.fn(), onSelectSpec: props.onSelectSpec ?? vi.fn(),
    onFocusLogs: props.onFocusLogs ?? vi.fn(), onFocusTasks: props.onFocusTasks ?? vi.fn(),
  });
  return React.createElement(Text, null, 'RunHotkeysTest');
};

const callbackNames = ['onTogglePanel', 'onStartRun', 'onRetryTask', 'onRetryAllFailed', 'onResetTask', 'onResetAllTasks', 'onSelectSpec', 'onFocusLogs', 'onFocusTasks'] as const;
type CallbackName = (typeof callbackNames)[number];
type Callbacks = Record<CallbackName, ReturnType<typeof vi.fn>>;

describe('useRunHotkeys', () => {
  let callbacks: Callbacks;
  beforeEach(() => {
    callbacks = Object.fromEntries(callbackNames.map((name) => [name, vi.fn()])) as Callbacks;
  });

  it('alterna painel com Tab em qualquer foco e Escape devolve logs para tasks', async () => {
    const tasks = render(React.createElement(Harness, callbacks));
    tasks.stdin.write('\t');
    await flushAsync();
    expect(callbacks.onTogglePanel).toHaveBeenCalledOnce();

    const logs = render(React.createElement(Harness, { ...callbacks, focusedPanel: 'logs' }));
    logs.stdin.write('\t');
    await flushAsync();
    logs.stdin.write('\u001B');
    await flushAsync(100);
    expect(callbacks.onTogglePanel).toHaveBeenCalledTimes(2);
    expect(callbacks.onFocusTasks).toHaveBeenCalledOnce();
  });

  it('inicia com Enter ou Espaço quando não está running', async () => {
    const { stdin } = render(React.createElement(Harness, callbacks));
    stdin.write('\r');
    stdin.write(' ');
    await flushAsync();
    expect(callbacks.onStartRun).toHaveBeenCalledTimes(2);
  });

  it('em running Enter foca logs e Espaço não faz nada', async () => {
    const { stdin } = render(React.createElement(Harness, { ...callbacks, effectiveStatus: 'running' }));
    stdin.write('\r');
    stdin.write(' ');
    await flushAsync();
    expect(callbacks.onStartRun).not.toHaveBeenCalled();
    expect(callbacks.onFocusLogs).toHaveBeenCalledOnce();
  });

  it('mapeia s, r, R, c, x e X, distinguindo maiúsculas de minúsculas', async () => {
    const { stdin } = render(React.createElement(Harness, callbacks));
    for (const key of ['s', 'r', 'R', 'x', 'X']) stdin.write(key);
    await flushAsync();
    expect(callbacks.onSelectSpec).toHaveBeenCalledOnce();
    expect(callbacks.onRetryTask).toHaveBeenCalledOnce();
    expect(callbacks.onRetryAllFailed).toHaveBeenCalledOnce();
    expect(callbacks.onResetTask).toHaveBeenCalledOnce();
    expect(callbacks.onResetAllTasks).toHaveBeenCalledOnce();
  });

  it('exige seleção para complete/reset e task failed selecionada para retry', async () => {
    const none = render(React.createElement(Harness, { ...callbacks, selectedTaskId: null }));
    for (const key of ['r', 'x']) none.stdin.write(key);
    await flushAsync();
    expect(callbacks.onRetryTask).not.toHaveBeenCalled();
    expect(callbacks.onResetTask).not.toHaveBeenCalled();

    const pending = render(React.createElement(Harness, { ...callbacks, selectedTaskStatus: 'pending' }));
    pending.stdin.write('r');
    await flushAsync();
    expect(callbacks.onRetryTask).not.toHaveBeenCalled();
  });

  it('não executa ações de tasks quando o foco está nos logs', async () => {
    const { stdin } = render(React.createElement(Harness, { ...callbacks, focusedPanel: 'logs' }));
    for (const key of ['s', 'r', 'R', 'x', 'X', ' ']) stdin.write(key);
    await flushAsync();
    for (const name of callbackNames) expect(callbacks[name]).not.toHaveBeenCalled();
  });

  it.each([['isInteractive', false], ['isModalOpen', true], ['isTextInputActive', true]] as const)(
    'bloqueia todos os atalhos quando %s impede interação',
    async (property, value) => {
      const { stdin } = render(React.createElement(Harness, { ...callbacks, [property]: value }));
      for (const key of ['\t', '\r', 'r', 'R', 'x', 'X', 's']) stdin.write(key);
      await flushAsync();
      for (const name of callbackNames) expect(callbacks[name]).not.toHaveBeenCalled();
    },
  );
});
