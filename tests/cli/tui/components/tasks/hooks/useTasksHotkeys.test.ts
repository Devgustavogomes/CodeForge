import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useTasksHotkeys,
  UseTasksHotkeysProps,
} from '../../../../../../src/cli/tui/components/tasks/hooks/useTasksHotkeys.js';
import { flushAsync } from '../../../helpers/flushAsync.js';

type HarnessProps = Partial<UseTasksHotkeysProps>;

const callbackNames = [
  'onOpenTask',
  'onOpenDeleteModal',
  'onNextTask',
  'onPrevTask',
  'onNextSpec',
  'onPrevSpec',
  'onToggleViewJson',
  'onToggleExpand',
  'onComplete',
  'onReset',
  'onStartSearch',
] as const;

type CallbackName = (typeof callbackNames)[number];
type Callbacks = Record<CallbackName, ReturnType<typeof vi.fn>>;

const HotkeysHarness: React.FC<HarnessProps> = (props) => {
  useTasksHotkeys({
    isInteractive: props.isInteractive,
    isModalOpen: props.isModalOpen,
    isSearchingSpec: props.isSearchingSpec,
    isTextInputActive: props.isTextInputActive,
    hasSelectedTask: props.hasSelectedTask ?? true,
    onOpenTask: props.onOpenTask,
    onOpenDeleteModal: props.onOpenDeleteModal,
    onNextTask: props.onNextTask ?? vi.fn(),
    onPrevTask: props.onPrevTask ?? vi.fn(),
    onNextSpec: props.onNextSpec ?? vi.fn(),
    onPrevSpec: props.onPrevSpec ?? vi.fn(),
    onToggleViewJson: props.onToggleViewJson ?? vi.fn(),
    onToggleExpand: props.onToggleExpand,
    onComplete: props.onComplete ?? vi.fn(),
    onReset: props.onReset ?? vi.fn(),
    onStartSearch: props.onStartSearch,
  });

  return React.createElement(Text, null, 'TasksHotkeysTest');
};

describe('useTasksHotkeys', () => {
  let callbacks: Callbacks;

  beforeEach(() => {
    callbacks = Object.fromEntries(
      callbackNames.map((name) => [name, vi.fn()]),
    ) as Callbacks;
  });

  it.each(['d', 'D'])('dispatches delete for %s when a task is selected', async (input) => {
    const { stdin } = render(
      React.createElement(HotkeysHarness, { ...callbacks, hasSelectedTask: true }),
    );

    stdin.write(input);
    await flushAsync();

    expect(callbacks.onOpenDeleteModal).toHaveBeenCalledOnce();
    expect(callbacks.onOpenTask).not.toHaveBeenCalled();
  });

  it('does not dispatch delete without a selected task', async () => {
    const { stdin } = render(
      React.createElement(HotkeysHarness, {
        ...callbacks,
        hasSelectedTask: false,
      }),
    );

    stdin.write('d');
    stdin.write('D');
    await flushAsync();

    expect(callbacks.onOpenDeleteModal).not.toHaveBeenCalled();
  });

  it.each([
    ['non-interactive mode', { isInteractive: false }],
    ['an open task-view modal', { isModalOpen: true }],
    ['an open delete modal', { isModalOpen: true }],
    ['specification search', { isSearchingSpec: true }],
    ['active text input', { isTextInputActive: true }],
  ] as const)('blocks delete during %s', async (_label, guardProps) => {
    const { stdin } = render(
      React.createElement(HotkeysHarness, {
        ...callbacks,
        ...guardProps,
      }),
    );

    stdin.write('d');
    stdin.write('D');
    await flushAsync();

    expect(callbacks.onOpenDeleteModal).not.toHaveBeenCalled();
  });

  it('preserves task, spec, view, complete, reset, and search dispatches', async () => {
    const { stdin } = render(React.createElement(HotkeysHarness, callbacks));

    for (const input of [
      '\r',
      'j',
      'k',
      ']',
      '[',
      'v',
      'e',
      'c',
      'x',
      '/',
    ]) {
      stdin.write(input);
      await flushAsync();
    }

    expect(callbacks.onOpenTask).toHaveBeenCalledOnce();
    expect(callbacks.onNextTask).toHaveBeenCalledOnce();
    expect(callbacks.onPrevTask).toHaveBeenCalledOnce();
    expect(callbacks.onNextSpec).toHaveBeenCalledOnce();
    expect(callbacks.onPrevSpec).toHaveBeenCalledOnce();
    expect(callbacks.onToggleViewJson).toHaveBeenCalledOnce();
    expect(callbacks.onToggleExpand).toHaveBeenCalledOnce();
    expect(callbacks.onComplete).toHaveBeenCalledOnce();
    expect(callbacks.onReset).toHaveBeenCalledOnce();
    expect(callbacks.onStartSearch).toHaveBeenCalledOnce();
    expect(callbacks.onOpenDeleteModal).not.toHaveBeenCalled();
  });
});
