import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { CreateSpecModal } from '../../../../../src/cli/tui/components/specs/CreateSpecModal.js';
import { CreateSpecUseCase } from '../../../../../src/application/use-cases/CreateSpecUseCase.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('CreateSpecModal component', () => {
  it('renders modal with input field when isOpen is true', () => {
    const { lastFrame } = render(<CreateSpecModal isOpen={true} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('Create Specification');
    expect(output).toContain('Enter a descriptive title or slug');
    expect(output).toContain('[Enter] Create');
    expect(output).toContain('[Esc] Cancel');
  });

  it('does not render when isOpen is false', () => {
    const { lastFrame } = render(<CreateSpecModal isOpen={false} />);
    expect(lastFrame()).toBe('');
  });

  it('displays error if submitted with empty title', async () => {
    const { lastFrame, stdin } = render(<CreateSpecModal isOpen={true} />);

    stdin.write('\r');
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('Specification title cannot be empty');
  });

  it('calls CreateSpecUseCase and triggers onSuccess when Enter is pressed with valid input', async () => {
    const mockExecute = vi.fn().mockReturnValue({
      kind: 'created',
      filePath: '.codeforge/specs/auth-service.md',
    });
    const mockUseCase = {
      execute: mockExecute,
    } as unknown as CreateSpecUseCase;

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    const { stdin } = render(
      <CreateSpecModal
        isOpen={true}
        createSpecUseCase={mockUseCase}
        onSuccess={onSuccess}
        onClose={onClose}
      />
    );

    // Type spec name
    stdin.write('Auth Service');
    await tick();

    // Press Enter to submit
    stdin.write('\r');
    await tick();

    expect(mockExecute).toHaveBeenCalledWith('Auth Service');
    expect(onSuccess).toHaveBeenCalledWith('auth-service', '.codeforge/specs/auth-service.md');
    expect(onClose).toHaveBeenCalled();
  });

  it('displays error when spec already exists', async () => {
    const mockExecute = vi.fn().mockReturnValue({
      kind: 'already-exists',
      filePath: '.codeforge/specs/existing.md',
    });
    const mockUseCase = {
      execute: mockExecute,
    } as unknown as CreateSpecUseCase;

    const { lastFrame, stdin } = render(
      <CreateSpecModal isOpen={true} createSpecUseCase={mockUseCase} />
    );

    stdin.write('existing');
    await tick();
    stdin.write('\r');
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('already exists');
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    const { stdin } = render(<CreateSpecModal isOpen={true} onClose={onClose} />);

    stdin.write('\u001B'); // Esc
    await tick();

    expect(onClose).toHaveBeenCalled();
  });
});
