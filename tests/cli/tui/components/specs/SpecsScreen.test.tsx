import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { SpecsScreen, SpecItemWithStats } from '../../../../../src/cli/tui/components/specs/SpecsScreen.js';
import { CreateSpecUseCase } from '../../../../../src/application/use-cases/CreateSpecUseCase.js';
import { PullSpecUseCase } from '../../../../../src/application/use-cases/PullSpecUseCase.js';
import { ListSpecsUseCase } from '../../../../../src/application/use-cases/ListSpecsUseCase.js';
import { DeleteSpecUseCase } from '../../../../../src/application/use-cases/DeleteSpecUseCase.js';
import { PlanningProvider } from '../../../../../src/cli/tui/context/PlanningContext.js';
import { useNavigation } from '../../../../../src/cli/tui/context/NavigationContext.js';
import { useExecution } from '../../../../../src/cli/tui/context/ExecutionContext.js';
import { renderWithProviders, createMockContainer, flushAsync } from '../../helpers/renderWithProviders.js';
import { translate } from '../../../../../src/cli/ui/i18n.js';

const normalizeOutput = (value: string): string =>
  value.replace(/[│╭╮╰╯─┌┐└┘]/g, ' ').replace(/\s+/g, ' ');

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

  it('opens a cascade-delete confirmation with d and cancels with n without deleting', async () => {
    const executeDelete = vi.fn();
    const generatePlan = vi.fn();
    const container = createMockContainer({
      listSpecsUseCase: mockListSpecsUseCase,
      deleteSpecUseCase: { execute: executeDelete } as unknown as DeleteSpecUseCase,
      generatePlanUseCase: { execute: generatePlan } as any,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <SpecsScreen initialSpecs={mockSpecs} container={container} isInteractive={true} />,
      { container }
    );

    expect(lastFrame() ?? '').toContain('[d] Delete');

    stdin.write('d');
    await flushAsync();

    const modalOutput = normalizeOutput(lastFrame() ?? '');
    expect(modalOutput).toContain(translate('tui_spec_delete_title', 'en'));
    expect(modalOutput).toContain(translate('tui_spec_delete_detail', 'en', { spec: 'auth' }));
    expect(modalOutput).toContain(translate('tui_spec_delete_warning', 'en'));
    expect(executeDelete).not.toHaveBeenCalled();

    // Background shortcuts stay disabled while the confirmation owns input.
    stdin.write('g');
    stdin.write('j');
    await flushAsync();
    expect(generatePlan).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').toContain('Specification: auth');

    stdin.write('n');
    await flushAsync();

    expect(executeDelete).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').not.toContain(translate('tui_spec_delete_title', 'en'));
    expect(lastFrame() ?? '').toContain('Name:  auth');
    expect(lastFrame() ?? '').toContain('[d] Delete');
  });

  it('cancels delete confirmation with Escape', async () => {
    const executeDelete = vi.fn();
    const container = createMockContainer({
      deleteSpecUseCase: { execute: executeDelete } as unknown as DeleteSpecUseCase,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <SpecsScreen initialSpecs={mockSpecs} container={container} isInteractive={true} />,
      { container }
    );

    stdin.write('d');
    await flushAsync();
    stdin.write('\u001B');
    await flushAsync(100);

    expect(executeDelete).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').not.toContain(translate('tui_spec_delete_title', 'en'));
  });

  it.each([
    ['y', 'y'],
    ['Enter', '\r'],
  ])('confirms with %s, refreshes the list, clamps selection, and publishes feedback', async (_label, key) => {
    const refreshedSpecs = [mockSpecs[0]];
    const listSpecsUseCase = {
      execute: vi.fn().mockReturnValue(refreshedSpecs),
      listNames: vi.fn().mockReturnValue(['auth']),
    } as unknown as ListSpecsUseCase;
    const executeDelete = vi.fn().mockReturnValue({ kind: 'deleted', specName: 'tui' });
    const onFeedback = vi.fn();
    const container = createMockContainer({
      listSpecsUseCase,
      deleteSpecUseCase: { execute: executeDelete } as unknown as DeleteSpecUseCase,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <SpecsScreen
        initialSpecs={mockSpecs}
        container={container}
        isInteractive={true}
        onFeedback={onFeedback}
      />,
      { container }
    );

    stdin.write('j');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Name:  tui');
    stdin.write('d');
    await flushAsync();
    stdin.write(key);
    await flushAsync();

    const expectedFeedback = {
      type: 'success',
      message: translate('tui_spec_delete_success', 'en', { spec: 'tui' }),
    };
    expect(executeDelete).toHaveBeenCalledTimes(1);
    expect(executeDelete).toHaveBeenCalledWith('tui');
    expect((listSpecsUseCase.execute as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(lastFrame() ?? '').toContain('Name:  auth');
    expect(lastFrame() ?? '').toContain(expectedFeedback.message);
    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith(expectedFeedback);
  });

  it('ignores d when there is no selected specification', async () => {
    const executeDelete = vi.fn();
    const container = createMockContainer({
      deleteSpecUseCase: { execute: executeDelete } as unknown as DeleteSpecUseCase,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <SpecsScreen initialSpecs={[]} container={container} isInteractive={true} />,
      { container }
    );

    stdin.write('d');
    await flushAsync();

    expect(executeDelete).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').not.toContain(translate('tui_spec_delete_title', 'en'));
  });

  it.each([
    {
      label: 'a missing spec result',
      execute: () => ({ kind: 'spec-not-found' as const }),
      expected: translate('tui_spec_delete_not_found', 'en', { spec: 'auth' }),
    },
    {
      label: 'an uninitialized workspace result',
      execute: () => ({ kind: 'not-initialized' as const }),
      expected: translate('tui_delete_not_initialized', 'en'),
    },
    {
      label: 'a thrown error',
      execute: () => {
        throw new Error('permission denied');
      },
      expected: translate('tui_spec_delete_error', 'en', {
        spec: 'auth',
        error: 'permission denied',
      }),
    },
  ])('keeps the list intact and publishes localized feedback for $label', async ({ execute, expected }) => {
    const executeDelete = vi.fn(execute);
    const listSpecsUseCase = {
      execute: vi.fn().mockReturnValue([]),
      listNames: vi.fn().mockReturnValue([]),
    } as unknown as ListSpecsUseCase;
    const onFeedback = vi.fn();
    const container = createMockContainer({
      listSpecsUseCase,
      deleteSpecUseCase: { execute: executeDelete } as unknown as DeleteSpecUseCase,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <SpecsScreen
        initialSpecs={mockSpecs}
        container={container}
        isInteractive={true}
        onFeedback={onFeedback}
      />,
      { container }
    );

    stdin.write('d');
    await flushAsync();
    stdin.write('y');
    await flushAsync();

    expect(executeDelete).toHaveBeenCalledTimes(1);
    expect(listSpecsUseCase.execute).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').toContain('Name:  auth');
    expect(lastFrame() ?? '').toContain(expected.slice(0, 42));
    expect(onFeedback).toHaveBeenCalledWith({ type: 'error', message: expected });
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

  it('opens PullSpecModal on "p" and submits successfully', async () => {
    const mockPullSpec = vi.spyOn(PullSpecUseCase.prototype, 'execute').mockResolvedValue({
      kind: 'success',
      filename: 'issue-101',
      filePath: '.codeforge/specs/issue-101.md',
      spec: { id: '101', title: 'Issue 101', description: 'Issue 101 description' },
      content: '# Issue 101',
      overwritten: false,
    });

    const mockGeneratePlan = vi.fn();
    const container = createMockContainer({
      listSpecsUseCase: mockListSpecsUseCase,
      generatePlanUseCase: { execute: mockGeneratePlan } as any,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <PlanningProvider container={container}>
        <SpecsScreen initialSpecs={mockSpecs} container={container} isInteractive={true} />
      </PlanningProvider>,
      { container }
    );

    // Open pull modal ('p' hotkey)
    stdin.write('p');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Pull Specification');
    // Ensure 'p' does NOT trigger plan generation
    expect(mockGeneratePlan).not.toHaveBeenCalled();

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

  it('triggers plan generation on "g" for selected spec via PlanningContext', async () => {
    const mockGeneratePlanUseCase = {
      execute: vi.fn().mockResolvedValue({
        kind: 'valid',
      }),
    };

    const container = createMockContainer({
      listSpecsUseCase: mockListSpecsUseCase,
      generatePlanUseCase: mockGeneratePlanUseCase as any,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <PlanningProvider container={container}>
        <SpecsScreen
          initialSpecs={mockSpecs}
          container={container}
          isInteractive={true}
        />
      </PlanningProvider>,
      { container }
    );

    stdin.write('g');

    await vi.waitFor(() => {
      expect(mockGeneratePlanUseCase.execute).toHaveBeenCalledWith('auth', expect.any(String));
      expect(lastFrame() ?? '').toContain('Plano Gerado com Sucesso');
      expect(lastFrame() ?? '').toContain('Plan generated and validated successfully for');
    });
  });

  it('invokes onOpenTasks callback on "t"', async () => {
    const onOpenTasks = vi.fn();
    const container = createMockContainer({
      listSpecsUseCase: mockListSpecsUseCase,
    });

    let currentActiveSpec: string | null | undefined;
    const Observer: React.FC = () => {
      const exec = useExecution();
      currentActiveSpec = exec.activeSpec;
      return null;
    };

    const { stdin } = renderWithProviders(
      <PlanningProvider container={container}>
        <Observer />
        <SpecsScreen
          initialSpecs={mockSpecs}
          container={container}
          isInteractive={true}
          onOpenTasks={onOpenTasks}
        />
      </PlanningProvider>,
      { container }
    );

    stdin.write('t');
    await flushAsync();

    expect(onOpenTasks).toHaveBeenCalledWith('auth');
    expect(currentActiveSpec).toBe('auth');
  });

  it('switches to tasks tab and sets activeSpec on "t" without onOpenTasks callback', async () => {
    let currentTab: string | undefined;
    let currentActiveSpec: string | null | undefined;
    const Observer: React.FC = () => {
      const nav = useNavigation();
      const exec = useExecution();
      currentTab = nav.activeTab;
      currentActiveSpec = exec.activeSpec;
      return null;
    };

    const container = createMockContainer({
      listSpecsUseCase: mockListSpecsUseCase,
    });

    const { stdin } = renderWithProviders(
      <PlanningProvider container={container}>
        <Observer />
        <SpecsScreen
          initialSpecs={mockSpecs}
          container={container}
          isInteractive={true}
        />
      </PlanningProvider>,
      { container }
    );

    stdin.write('t');
    await flushAsync();

    expect(currentActiveSpec).toBe('auth');
    expect(currentTab).toBe('tasks');
  });

  it('displays concurrency warning when attempting to generate plan while another is running', async () => {
    let resolveGeneratePlan: (val: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveGeneratePlan = resolve;
    });

    const mockGeneratePlanUseCase = {
      execute: vi.fn().mockReturnValue(pendingPromise),
    };

    const container = createMockContainer({
      listSpecsUseCase: mockListSpecsUseCase,
      generatePlanUseCase: mockGeneratePlanUseCase as any,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <PlanningProvider container={container}>
        <SpecsScreen
          initialSpecs={mockSpecs}
          container={container}
          isInteractive={true}
        />
      </PlanningProvider>,
      { container }
    );

    // Trigger plan generation on first spec ('auth')
    stdin.write('g');
    await flushAsync();

    // Verify 'auth' is currently generating
    expect(lastFrame() ?? '').toContain('Gerando Plano de Execução [auth]');

    // Navigate down to 'tui'
    stdin.write('j');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Name:  tui');

    // Attempt to generate plan on 'tui' while 'auth' is generating
    stdin.write('g');
    await flushAsync();

    // Concurrency warning should appear
    expect(lastFrame() ?? '').toContain(
      'Já existe um plano sendo gerado para "auth".'
    );

    // Verify use case was only called once
    expect(mockGeneratePlanUseCase.execute).toHaveBeenCalledTimes(1);

    // Resolve promise to clean up
    resolveGeneratePlan!({ kind: 'valid' });
    await flushAsync();
  });
});
