import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useDocsHotkeys,
  UseDocsHotkeysOptions,
} from '../../../../../../src/cli/tui/components/docs/hooks/useDocsHotkeys.js';
import { flushAsync } from '../../../helpers/flushAsync.js';

type HarnessProps = Partial<UseDocsHotkeysOptions>;

const DocsHotkeysHarness: React.FC<HarnessProps> = (props) => {
  useDocsHotkeys({
    docsCount: props.docsCount ?? 2,
    selectedIndex: props.selectedIndex ?? 0,
    onSelectIndex: props.onSelectIndex ?? vi.fn(),
    onOpenCreateModal: props.onOpenCreateModal ?? vi.fn(),
    onOpenUpdateModal: props.onOpenUpdateModal,
    onUpdateDoc: props.onUpdateDoc,
    onOpenDeleteModal: props.onOpenDeleteModal,
    onViewDoc: props.onViewDoc,
    onClearFeedback: props.onClearFeedback,
    isInteractive: props.isInteractive,
    isModalOpen: props.isModalOpen,
    isCreateModalOpen: props.isCreateModalOpen,
    isUpdateModalOpen: props.isUpdateModalOpen,
    isViewModalOpen: props.isViewModalOpen,
    isDeleteModalOpen: props.isDeleteModalOpen,
    isTextInputActive: props.isTextInputActive,
  });

  return React.createElement(Text, null, 'Docs hotkeys');
};

describe('useDocsHotkeys', () => {
  let callbacks: {
    onSelectIndex: ReturnType<typeof vi.fn>;
    onOpenCreateModal: ReturnType<typeof vi.fn>;
    onOpenUpdateModal: ReturnType<typeof vi.fn>;
    onOpenDeleteModal: ReturnType<typeof vi.fn>;
    onViewDoc: ReturnType<typeof vi.fn>;
    onClearFeedback: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    callbacks = {
      onSelectIndex: vi.fn(),
      onOpenCreateModal: vi.fn(),
      onOpenUpdateModal: vi.fn(),
      onOpenDeleteModal: vi.fn(),
      onViewDoc: vi.fn(),
      onClearFeedback: vi.fn(),
    };
  });

  it.each(['d', 'D'])('opens delete confirmation with %s for a valid selection', async (input) => {
    const { stdin } = render(
      React.createElement(DocsHotkeysHarness, {
        ...callbacks,
        docsCount: 2,
        selectedIndex: 1,
      }),
    );

    stdin.write(input);
    await flushAsync();

    expect(callbacks.onOpenDeleteModal).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an empty list', 0, 0],
    ['a negative index', 2, -1],
    ['an out-of-range index', 2, 2],
  ])('ignores delete for %s', async (_label, docsCount, selectedIndex) => {
    const { stdin } = render(
      React.createElement(DocsHotkeysHarness, {
        ...callbacks,
        docsCount,
        selectedIndex,
      }),
    );

    stdin.write('d');
    await flushAsync();

    expect(callbacks.onOpenDeleteModal).not.toHaveBeenCalled();
  });

  it.each([
    ['the generic modal flag', { isModalOpen: true }],
    ['the create modal', { isCreateModalOpen: true }],
    ['the update modal', { isUpdateModalOpen: true }],
    ['the view modal', { isViewModalOpen: true }],
    ['the delete modal', { isDeleteModalOpen: true }],
    ['a text input', { isTextInputActive: true }],
    ['non-interactive mode', { isInteractive: false }],
  ])('suppresses all screen hotkeys during %s', async (_label, state) => {
    const { stdin } = render(
      React.createElement(DocsHotkeysHarness, {
        ...callbacks,
        ...state,
      }),
    );

    stdin.write('d');
    stdin.write('c');
    stdin.write('u');
    stdin.write('\r');
    stdin.write('j');
    await flushAsync();

    expect(callbacks.onOpenDeleteModal).not.toHaveBeenCalled();
    expect(callbacks.onOpenCreateModal).not.toHaveBeenCalled();
    expect(callbacks.onOpenUpdateModal).not.toHaveBeenCalled();
    expect(callbacks.onViewDoc).not.toHaveBeenCalled();
    expect(callbacks.onSelectIndex).not.toHaveBeenCalled();
  });

  it('preserves create, update, view, and navigation hotkeys outside a modal', async () => {
    const { stdin } = render(
      React.createElement(DocsHotkeysHarness, {
        ...callbacks,
        docsCount: 2,
        selectedIndex: 0,
      }),
    );

    stdin.write('c');
    stdin.write('u');
    stdin.write('\r');
    stdin.write('j');
    await flushAsync();

    expect(callbacks.onOpenCreateModal).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpenUpdateModal).toHaveBeenCalledTimes(1);
    expect(callbacks.onViewDoc).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelectIndex).toHaveBeenCalledWith(1);
    expect(callbacks.onOpenDeleteModal).not.toHaveBeenCalled();
  });
});
