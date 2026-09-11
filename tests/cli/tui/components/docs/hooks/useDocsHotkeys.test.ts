import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  useDocsHotkeys,
  UseDocsHotkeysOptions,
} from '../../../../../../src/cli/tui/components/docs/hooks/useDocsHotkeys.js';

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

const TestHotkeysComponent: React.FC<UseDocsHotkeysOptions> = (props) => {
  useDocsHotkeys(props);
  return React.createElement(Text, null, `Index:${props.selectedIndex}`);
};

describe('useDocsHotkeys hook', () => {
  const defaultProps: UseDocsHotkeysOptions = {
    isInteractive: true,
    isModalOpen: false,
    isCreateModalOpen: false,
    isUpdateModalOpen: false,
    isTextInputActive: false,
    docsCount: 3,
    selectedIndex: 0,
    onSelectIndex: vi.fn(),
    onOpenCreateModal: vi.fn(),
    onOpenUpdateModal: vi.fn(),
    onUpdateDoc: vi.fn(),
    onViewDoc: vi.fn(),
    onClearFeedback: vi.fn(),
  };

  it('invoca onOpenUpdateModal ao pressionar "u" quando há documentos na lista', async () => {
    const onOpenUpdateModal = vi.fn();
    const onUpdateDoc = vi.fn();
    const { stdin } = render(
      React.createElement(TestHotkeysComponent, {
        ...defaultProps,
        docsCount: 2,
        onOpenUpdateModal,
        onUpdateDoc,
      })
    );

    stdin.write('u');
    await tick();

    expect(onOpenUpdateModal).toHaveBeenCalledTimes(1);
    expect(onUpdateDoc).not.toHaveBeenCalled();
  });

  it('invoca onOpenUpdateModal ao pressionar "U" maiúsculo', async () => {
    const onOpenUpdateModal = vi.fn();
    const { stdin } = render(
      React.createElement(TestHotkeysComponent, {
        ...defaultProps,
        docsCount: 2,
        onOpenUpdateModal,
      })
    );

    stdin.write('U');
    await tick();

    expect(onOpenUpdateModal).toHaveBeenCalledTimes(1);
  });

  it('ignora a tecla "u" quando docsCount for 0', async () => {
    const onOpenUpdateModal = vi.fn();
    const onUpdateDoc = vi.fn();
    const { stdin } = render(
      React.createElement(TestHotkeysComponent, {
        ...defaultProps,
        docsCount: 0,
        onOpenUpdateModal,
        onUpdateDoc,
      })
    );

    stdin.write('u');
    await tick();

    expect(onOpenUpdateModal).not.toHaveBeenCalled();
    expect(onUpdateDoc).not.toHaveBeenCalled();
  });

  it('recorre a onUpdateDoc se onOpenUpdateModal não for fornecido', async () => {
    const onUpdateDoc = vi.fn();
    const { stdin } = render(
      React.createElement(TestHotkeysComponent, {
        ...defaultProps,
        docsCount: 1,
        onOpenUpdateModal: undefined,
        onUpdateDoc,
      })
    );

    stdin.write('u');
    await tick();

    expect(onUpdateDoc).toHaveBeenCalledTimes(1);
  });

  it('não responde a hotkeys quando isUpdateModalOpen for true', async () => {
    const onOpenUpdateModal = vi.fn();
    const onOpenCreateModal = vi.fn();
    const onSelectIndex = vi.fn();
    const { stdin } = render(
      React.createElement(TestHotkeysComponent, {
        ...defaultProps,
        isUpdateModalOpen: true,
        onOpenUpdateModal,
        onOpenCreateModal,
        onSelectIndex,
      })
    );

    stdin.write('u');
    await tick();
    stdin.write('c');
    await tick();
    stdin.write('j');
    await tick();

    expect(onOpenUpdateModal).not.toHaveBeenCalled();
    expect(onOpenCreateModal).not.toHaveBeenCalled();
    expect(onSelectIndex).not.toHaveBeenCalled();
  });

  it('não responde a hotkeys quando isModalOpen for true', async () => {
    const onOpenUpdateModal = vi.fn();
    const { stdin } = render(
      React.createElement(TestHotkeysComponent, {
        ...defaultProps,
        isModalOpen: true,
        onOpenUpdateModal,
      })
    );

    stdin.write('u');
    await tick();

    expect(onOpenUpdateModal).not.toHaveBeenCalled();
  });

  it('invoca onOpenCreateModal ao pressionar "c" ou "C"', async () => {
    const onOpenCreateModal = vi.fn();
    const { stdin } = render(
      React.createElement(TestHotkeysComponent, {
        ...defaultProps,
        onOpenCreateModal,
      })
    );

    stdin.write('c');
    await tick();
    expect(onOpenCreateModal).toHaveBeenCalledTimes(1);

    stdin.write('C');
    await tick();
    expect(onOpenCreateModal).toHaveBeenCalledTimes(2);
  });

  it('navega lista com j/k e setas, chamando onClearFeedback', async () => {
    const onSelectIndex = vi.fn();
    const onClearFeedback = vi.fn();
    const { stdin } = render(
      React.createElement(TestHotkeysComponent, {
        ...defaultProps,
        docsCount: 3,
        selectedIndex: 0,
        onSelectIndex,
        onClearFeedback,
      })
    );

    stdin.write('j');
    await tick();
    expect(onSelectIndex).toHaveBeenCalledWith(1);
    expect(onClearFeedback).toHaveBeenCalled();

    stdin.write('k');
    await tick();
    expect(onSelectIndex).toHaveBeenCalledWith(2);
  });

  it('invoca onViewDoc ao pressionar Enter', async () => {
    const onViewDoc = vi.fn();
    const { stdin } = render(
      React.createElement(TestHotkeysComponent, {
        ...defaultProps,
        onViewDoc,
      })
    );

    stdin.write('\r');
    await tick();
    expect(onViewDoc).toHaveBeenCalledTimes(1);
  });
});
