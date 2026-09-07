import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { PullSpecModal } from '../../../../../src/cli/tui/components/specs/PullSpecModal.js';
import { PullSpecUseCase } from '../../../../../src/application/use-cases/PullSpecUseCase.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PullSpecModal component', () => {
  it('renders modal with provider selector and inputs', () => {
    const { lastFrame } = render(<PullSpecModal isOpen={true} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('Pull Specification');
    expect(output).toContain('1. Source Provider:');
    expect(output).toContain('2. Spec ID / Issue Number / URL:');
    expect(output).toContain('3. Custom Filename (optional):');
    expect(output).toContain('[Enter] Pull');
    expect(output).toContain('[Esc] Cancel');
  });

  it('validates required spec ID on submit', async () => {
    const { lastFrame, stdin } = render(<PullSpecModal isOpen={true} />);

    // Press Enter immediately on empty ID
    stdin.write('\r');
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('Spec ID');
  });

  it('cycles providers and submits pull successfully', async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      kind: 'success',
      filename: 'issue-101',
      filePath: '.codeforge/specs/issue-101.md',
      spec: { id: '101', title: 'Issue 101' },
      content: '# Issue 101',
      overwritten: false,
    });
    const mockUseCase = {
      execute: mockExecute,
    } as unknown as PullSpecUseCase;

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    const { stdin } = render(
      <PullSpecModal
        isOpen={true}
        pullSpecUseCase={mockUseCase}
        onSuccess={onSuccess}
        onClose={onClose}
      />
    );

    // Focus starts at 'id'. Type issue ID:
    stdin.write('101');
    await tick();

    // Submit with Enter
    stdin.write('\r');
    await tick();

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '101',
      })
    );
    expect(onSuccess).toHaveBeenCalledWith('issue-101', '.codeforge/specs/issue-101.md');
    expect(onClose).toHaveBeenCalled();
  });

  it('displays error message when pull fails', async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      kind: 'fetch-failed',
      error: 'HTTP 404 Issue Not Found',
    });
    const mockUseCase = {
      execute: mockExecute,
    } as unknown as PullSpecUseCase;

    const { lastFrame, stdin } = render(
      <PullSpecModal isOpen={true} pullSpecUseCase={mockUseCase} />
    );

    stdin.write('invalid-id');
    await tick();
    stdin.write('\r');
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('HTTP 404 Issue Not Found');
  });

  it('dismisses modal when Escape is pressed', async () => {
    const onClose = vi.fn();
    const { stdin } = render(<PullSpecModal isOpen={true} onClose={onClose} />);

    stdin.write('\u001B'); // Esc
    await tick();

    expect(onClose).toHaveBeenCalled();
  });

  it('displays available items when provider is filesystem', async () => {
    const { lastFrame } = render(<PullSpecModal isOpen={true} defaultProvider="filesystem" />);
    await tick(100);

    const output = lastFrame() ?? '';
    expect(output).toContain('Pull Specification');
    expect(output).toContain('● [filesystem]');
  });
});
