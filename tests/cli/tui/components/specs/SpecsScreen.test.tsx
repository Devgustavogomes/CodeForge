import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { SpecsScreen, SpecItemWithStats } from '../../../../../src/cli/tui/components/specs/SpecsScreen.js';
import { CreateSpecUseCase } from '../../../../../src/application/use-cases/CreateSpecUseCase.js';
import { PullSpecUseCase } from '../../../../../src/application/use-cases/PullSpecUseCase.js';
import { ListSpecsUseCase } from '../../../../../src/application/use-cases/ListSpecsUseCase.js';
import { renderWithProviders, createMockContainer, flushAsync } from '../../helpers/renderWithProviders.js';

describe('SpecsScreen component', () => {
  const mockSpecs: SpecItemWithStats[] = [
    {
      name: 'auth',
      title: 'Authentication Module',
      status: 'completed',
      taskCount: 5,
      updatedAt: '2026-09-06T12:00:00.000Z',
    },
    {
      name: 'tui',
      title: 'TUI Refactoring',
      status: 'in_progress',
      taskCount: 8,
      updatedAt: '2026-09-06T15:30:00.000Z',
    },
  ];

  const mockListSpecsUseCase = {
    execute: vi.fn().mockReturnValue(mockSpecs),
    listNames: vi.fn().mockReturnValue(mockSpecs.map((s) => s.name)),
  } as unknown as ListSpecsUseCase;

  it('renders specification list and details panel', () => {
    const { lastFrame } = renderWithProviders(
      <SpecsScreen initialSpecs={mockSpecs} isInteractive={false} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Specifications (2)');
    expect(output).toContain('auth');
    expect(output).toContain('[COMPLETED]');
    expect(output).toContain('5 tasks');
    expect(output).toContain('tui');
    expect(output).toContain('Spec Details & Actions');
    expect(output).toContain('Name:  auth');
  });

  it('opens CreateSpecModal on "c" and submits successfully', async () => {
    const mockCreateSpec = vi.fn().mockReturnValue({
      kind: 'created',
      filePath: '.codeforge/specs/auth-service.md',
    });
    const container = createMockContainer({
      listSpecsUseCase: mockListSpecsUseCase,
      createSpecUseCase: { execute: mockCreateSpec } as unknown as CreateSpecUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <SpecsScreen initialSpecs={mockSpecs} container={container} isInteractive={true} />,
      { container }
    );

    // Open create modal
    stdin.write('c');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Create Specification');

    // Type spec title and submit
    stdin.write('auth-service');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();

    expect(mockCreateSpec).toHaveBeenCalledWith('auth-service');
    expect(lastFrame() ?? '').toContain('Specification "auth-service" created');
  });

  it('opens PullSpecModal on "P" and submits successfully', async () => {
    const mockPullSpec = vi.spyOn(PullSpecUseCase.prototype, 'execute').mockResolvedValue({
      kind: 'success',
      filename: 'issue-101',
      filePath: '.codeforge/specs/issue-101.md',
      spec: { id: '101', title: 'Issue 101' },
      content: '# Issue 101',
      overwritten: false,
    });

    const container = createMockContainer({
      listSpecsUseCase: mockListSpecsUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <SpecsScreen initialSpecs={mockSpecs} container={container} isInteractive={true} />,
      { container }
    );

    // Open pull modal (P hotkey)
    stdin.write('P');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Pull Specification');

    // Type spec ID and submit
    stdin.write('101');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();

    expect(mockPullSpec).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '101',
      })
    );
    expect(lastFrame() ?? '').toContain('Specification "issue-101" pulled');

    mockPullSpec.mockRestore();
  });
});