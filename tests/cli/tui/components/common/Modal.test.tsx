import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { Modal } from '../../../../../src/cli/tui/components/common/Modal.js';

describe('Modal component', () => {
  it('renders title, children, close hint and rounded borders', () => {
    const { lastFrame } = render(
      <Modal title="Confirm Action">
        <Text>Are you sure you want to proceed?</Text>
      </Modal>
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Confirm Action');
    expect(output).toContain('[Esc] Close');
    expect(output).toContain('Are you sure you want to proceed?');
    expect(output).toMatch(/[╭─╮│╰╯]/);
  });

  it('renders null when isOpen is false', () => {
    const { lastFrame } = render(
      <Modal isOpen={false} title="Hidden Modal">
        <Text>Hidden content</Text>
      </Modal>
    );
    const output = lastFrame() ?? '';

    expect(output).toBe('');
    expect(output).not.toContain('Hidden Modal');
  });

  it('calls onClose callback when Escape key is pressed', async () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        <Text>Modal body</Text>
      </Modal>
    );

    // Press Escape (\u001B)
    stdin.write('\u001B');
    await new Promise((r) => setTimeout(r, 20));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
