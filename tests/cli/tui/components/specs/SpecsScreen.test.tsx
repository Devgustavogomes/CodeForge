import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { SpecsScreen, SpecItemWithStats } from '../../../../../src/cli/tui/components/specs/SpecsScreen.js';
import { AppContainer } from '../../../../../src/infrastructure/container.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

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

  it('renders list of specifications with status badges and task count', () => {
    const { lastFrame } = render(
      <SpecsScreen initialSpecs={mockSpecs} isInteractive={false} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Specifications (2)');
    expect(output).toContain('auth');
    expect(output).toContain('[COMPLETED]');
    expect(output).toContain('5 tasks');
    expect(output).toContain('tui');
    expect(output).toContain('[IN PROGRESS]');
    expect(output).toContain('8 tasks');
  });

  it('navigates specs and opens in Run dashboard when Enter is pressed', async () => {
    const onOpenRun = vi.fn();
    const { stdin } = render(
      <SpecsScreen
        initialSpecs={mockSpecs}
        onOpenRun={onOpenRun}
        isInteractive={true}
      />
    );

    // Initial selected spec is 'auth'. Press Enter:
    stdin.write('\r');
    await tick();
    expect(onOpenRun).toHaveBeenCalledWith('auth');

    // Press down arrow to select 'tui'
    stdin.write('\u001B[B'); // Down arrow
    await tick();
    stdin.write('\r');
    await tick();
    expect(onOpenRun).toHaveBeenCalledWith('tui');
  });

  it('validates plan when "v" key is pressed', async () => {
    const mockValidate = vi.fn().mockReturnValue({
      kind: 'valid',
    });
    const mockContainer = {
      validatePlanUseCase: {
        execute: mockValidate,
      },
      listSpecsUseCase: {
        execute: () => mockSpecs,
      },
      gw: {
        exists: () => false,
        listDir: () => [],
      },
    } as unknown as AppContainer;

    const { lastFrame, stdin } = render(
      <SpecsScreen
        container={mockContainer}
        initialSpecs={mockSpecs}
        isInteractive={true}
      />
    );

    // Press 'v' to validate plan
    stdin.write('v');
    await tick();

    expect(mockValidate).toHaveBeenCalledWith('auth');
    const output = lastFrame() ?? '';
    expect(output).toContain('is valid');
  });

  it('generates plan when "g" key is pressed', async () => {
    const mockGenerate = vi.fn().mockResolvedValue({
      kind: 'valid',
    });
    const mockContainer = {
      generatePlanUseCase: {
        execute: mockGenerate,
      },
      configService: {
        loadConfig: () => ({ plannerAgent: 'test-agent' }),
      },
      listSpecsUseCase: {
        execute: () => mockSpecs,
      },
      gw: {
        exists: () => false,
        listDir: () => [],
      },
    } as unknown as AppContainer;

    const { stdin } = render(
      <SpecsScreen
        container={mockContainer}
        initialSpecs={mockSpecs}
        isInteractive={true}
      />
    );

    // Press 'g' to generate plan
    stdin.write('g');
    await tick();

    expect(mockGenerate).toHaveBeenCalledWith('auth', 'test-agent');
  });

  it('opens CreateSpecModal on pressing "c" and PullSpecModal on pressing "p"', async () => {
    const { lastFrame, stdin } = render(
      <SpecsScreen initialSpecs={mockSpecs} isInteractive={true} />
    );

    // Press 'c'
    stdin.write('c');
    await tick();
    let output = lastFrame() ?? '';
    expect(output).toContain('Create Specification');

    // Close with Esc
    stdin.write('\u001B');
    await tick();

    // Press 'p'
    stdin.write('p');
    await tick();
    output = lastFrame() ?? '';
    expect(output).toContain('Pull Specification');
  });
});
