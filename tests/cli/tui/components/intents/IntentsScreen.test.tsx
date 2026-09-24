import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { IntentsScreen, IntentItemWithStats } from '../../../../../src/cli/tui/components/intents/IntentsScreen.js';
import { CreateIntentUseCase as CreateIntentUseCase } from '../../../../../src/application/use-cases/CreateIntentUseCase.js';
import { PullIntentUseCase as PullIntentUseCase } from '../../../../../src/application/use-cases/PullIntentUseCase.js';
import { ListIntentsUseCase as ListIntentsUseCase } from '../../../../../src/application/use-cases/ListIntentsUseCase.js';
import { DeleteIntentUseCase as DeleteIntentUseCase } from '../../../../../src/application/use-cases/DeleteIntentUseCase.js';
import { PlanningProvider } from '../../../../../src/cli/tui/context/PlanningContext.js';
import { ConfigProvider } from '../../../../../src/cli/tui/context/ConfigContext.js';
import { ContainerProvider } from '../../../../../src/cli/tui/context/ContainerContext.js';
import { useNavigation } from '../../../../../src/cli/tui/context/NavigationContext.js';
import { useExecution } from '../../../../../src/cli/tui/context/ExecutionContext.js';
import { renderWithProviders, createMockContainer, flushAsync } from '../../helpers/renderWithProviders.js';
import { translate } from '../../../../../src/cli/ui/i18n.js';

const TestPlanningProviders: React.FC<React.PropsWithChildren<{ container: ReturnType<typeof createMockContainer> }>> = ({ container, children }) => (
  <ContainerProvider container={container}>
    <ConfigProvider>
      <PlanningProvider container={container}>{children}</PlanningProvider>
    </ConfigProvider>
  </ContainerProvider>
);

const normalizeOutput = (value: string): string =>
  value.replace(/[│╭╮╰╯─┌┐└┘]/g, ' ').replace(/\s+/g, ' ');

describe('IntentsScreen component', () => {
  const mockIntents: IntentItemWithStats[] = [
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

  const mockListIntentsUseCase = {
    execute: vi.fn().mockReturnValue(mockIntents),
    listNames: vi.fn().mockReturnValue(mockIntents.map((s) => s.name)),
  } as unknown as ListIntentsUseCase;

  it('opens a cascade-delete confirmation with d and cancels with n without deleting', async () => {
    const executeDelete = vi.fn();
    const generatePlan = vi.fn();
    const container = createMockContainer({
      listIntentsUseCase: mockListIntentsUseCase,
      deleteIntentUseCase: { execute: executeDelete } as unknown as DeleteIntentUseCase,
      generatePlanUseCase: { execute: generatePlan } as any,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <IntentsScreen initialIntents={mockIntents} container={container} isInteractive={true} />,
      { container }
    );

    expect(lastFrame() ?? '').toContain('[d] Delete');

    stdin.write('d');
    await flushAsync();

    const modalOutput = normalizeOutput(lastFrame() ?? '');
    expect(modalOutput).toContain(translate('tui_intent_delete_title', 'en'));
    expect(modalOutput).toContain(translate('tui_intent_delete_detail', 'en', { intent: 'auth' }));
    expect(modalOutput).toContain(translate('tui_intent_delete_warning', 'en'));
    expect(executeDelete).not.toHaveBeenCalled();

    // Background shortcuts stay disabled while the confirmation owns input.
    stdin.write('g');
    stdin.write('j');
    await flushAsync();
    expect(generatePlan).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').toContain('Intent: auth');

    stdin.write('n');
    await flushAsync();

    expect(executeDelete).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').not.toContain(translate('tui_intent_delete_title', 'en'));
    expect(lastFrame() ?? '').toContain('Name:  auth');
    expect(lastFrame() ?? '').toContain('[d] Delete');
  });

  it('cancels delete confirmation with Escape', async () => {
    const executeDelete = vi.fn();
    const container = createMockContainer({
      deleteIntentUseCase: { execute: executeDelete } as unknown as DeleteIntentUseCase,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <IntentsScreen initialIntents={mockIntents} container={container} isInteractive={true} />,
      { container }
    );

    stdin.write('d');
    await flushAsync();
    stdin.write('\u001B');
    await flushAsync(100);

    expect(executeDelete).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').not.toContain(translate('tui_intent_delete_title', 'en'));
  });

  it.each([
    ['y', 'y'],
    ['Enter', '\r'],
  ])('confirms with %s, refreshes the list, clamps selection, and publishes feedback', async (_label, key) => {
    const refreshedIntents = [mockIntents[0]];
    const listIntentsUseCase = {
      execute: vi.fn().mockReturnValue(refreshedIntents),
      listNames: vi.fn().mockReturnValue(['auth']),
    } as unknown as ListIntentsUseCase;
    const executeDelete = vi.fn().mockReturnValue({ kind: 'deleted', intentName: 'tui' });
    const onFeedback = vi.fn();
    const container = createMockContainer({
      listIntentsUseCase,
      deleteIntentUseCase: { execute: executeDelete } as unknown as DeleteIntentUseCase,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <IntentsScreen
        initialIntents={mockIntents}
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
      message: translate('tui_intent_delete_success', 'en', { intent: 'tui' }),
    };
    expect(executeDelete).toHaveBeenCalledTimes(1);
    expect(executeDelete).toHaveBeenCalledWith('tui');
    expect((listIntentsUseCase.execute as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(lastFrame() ?? '').toContain('Name:  auth');
    expect(lastFrame() ?? '').toContain(expectedFeedback.message);
    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith(expectedFeedback);
  });

  it('ignores d when there is no selected intent', async () => {
    const executeDelete = vi.fn();
    const container = createMockContainer({
      deleteIntentUseCase: { execute: executeDelete } as unknown as DeleteIntentUseCase,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <IntentsScreen initialIntents={[]} container={container} isInteractive={true} />,
      { container }
    );

    stdin.write('d');
    await flushAsync();

    expect(executeDelete).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').not.toContain(translate('tui_intent_delete_title', 'en'));
  });

  it.each([
    {
      label: 'a missing intent result',
      execute: () => ({ kind: 'intent-not-found' as const }),
      expected: translate('tui_intent_delete_not_found', 'en', { intent: 'auth' }),
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
      expected: translate('tui_intent_delete_error', 'en', {
        intent: 'auth',
        error: 'permission denied',
      }),
    },
  ])('keeps the list intact and publishes localized feedback for $label', async ({ execute, expected }) => {
    const executeDelete = vi.fn(execute);
    const listIntentsUseCase = {
      execute: vi.fn().mockReturnValue([]),
      listNames: vi.fn().mockReturnValue([]),
    } as unknown as ListIntentsUseCase;
    const onFeedback = vi.fn();
    const container = createMockContainer({
      listIntentsUseCase,
      deleteIntentUseCase: { execute: executeDelete } as unknown as DeleteIntentUseCase,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <IntentsScreen
        initialIntents={mockIntents}
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
    expect(listIntentsUseCase.execute).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').toContain('Name:  auth');
    expect(lastFrame() ?? '').toContain(expected.slice(0, 42));
    expect(onFeedback).toHaveBeenCalledWith({ type: 'error', message: expected });
  });

  it('opens CreateIntentModal on "c" and submits successfully', async () => {
    const mockCreateIntent = vi.fn().mockReturnValue({
      kind: 'created',
      filePath: '.codeforge/intents/auth-service.md',
    });
    const container = createMockContainer({
      listIntentsUseCase: mockListIntentsUseCase,
      createIntentUseCase: { execute: mockCreateIntent } as unknown as CreateIntentUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <IntentsScreen initialIntents={mockIntents} container={container} isInteractive={true} />,
      { container }
    );

    // Open create modal
    stdin.write('c');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Create Intent');

    // Type intent title and submit
    stdin.write('auth-service');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();

    expect(mockCreateIntent).toHaveBeenCalledWith('auth-service');
    expect(lastFrame() ?? '').toContain('Intent "auth-service" created');
  });

  it('opens PullIntentModal on "p" and submits successfully', async () => {
    const mockPullIntent = vi.spyOn(PullIntentUseCase.prototype, 'execute').mockResolvedValue({
      kind: 'success',
      filename: 'issue-101',
      filePath: '.codeforge/intents/issue-101.md',
      intent: { id: '101', title: 'Issue 101', description: 'Issue 101 description' },
      content: '# Issue 101',
      overwritten: false,
    });

    const mockGeneratePlan = vi.fn();
    const container = createMockContainer({
      listIntentsUseCase: mockListIntentsUseCase,
      generatePlanUseCase: { execute: mockGeneratePlan } as any,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <TestPlanningProviders container={container}>
        <IntentsScreen initialIntents={mockIntents} container={container} isInteractive={true} />
      </TestPlanningProviders>,
      { container }
    );

    // Open pull modal ('p' hotkey)
    stdin.write('p');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Pull Intent');
    // Ensure 'p' does NOT trigger plan generation
    expect(mockGeneratePlan).not.toHaveBeenCalled();

    // Type intent ID and submit
    stdin.write('101');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();

    expect(mockPullIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '101',
      })
    );
    expect(lastFrame() ?? '').toContain('Intent "issue-101" pulled');

    mockPullIntent.mockRestore();
  });

  it('triggers plan generation on "g" for selected intent via PlanningContext', async () => {
    const mockGeneratePlanUseCase = {
      execute: vi.fn().mockResolvedValue({
        kind: 'valid',
      }),
    };

    const container = createMockContainer({
      listIntentsUseCase: mockListIntentsUseCase,
      generatePlanUseCase: mockGeneratePlanUseCase as any,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <TestPlanningProviders container={container}>
        <IntentsScreen
          initialIntents={mockIntents}
          container={container}
          isInteractive={true}
        />
      </TestPlanningProviders>,
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
      listIntentsUseCase: mockListIntentsUseCase,
    });

    let currentActiveIntent: string | null | undefined;
    const Observer: React.FC = () => {
      const exec = useExecution();
      currentActiveIntent = exec.activeIntent;
      return null;
    };

    const { stdin } = renderWithProviders(
      <TestPlanningProviders container={container}>
        <Observer />
        <IntentsScreen
          initialIntents={mockIntents}
          container={container}
          isInteractive={true}
          onOpenTasks={onOpenTasks}
        />
      </TestPlanningProviders>,
      { container }
    );

    stdin.write('t');
    await flushAsync();

    expect(onOpenTasks).toHaveBeenCalledWith('auth');
    expect(currentActiveIntent).toBe('auth');
  });

  it('switches to tasks tab and sets activeIntent on "t" without onOpenTasks callback', async () => {
    let currentTab: string | undefined;
    let currentActiveIntent: string | null | undefined;
    const Observer: React.FC = () => {
      const nav = useNavigation();
      const exec = useExecution();
      currentTab = nav.activeTab;
      currentActiveIntent = exec.activeIntent;
      return null;
    };

    const container = createMockContainer({
      listIntentsUseCase: mockListIntentsUseCase,
    });

    const { stdin } = renderWithProviders(
      <TestPlanningProviders container={container}>
        <Observer />
        <IntentsScreen
          initialIntents={mockIntents}
          container={container}
          isInteractive={true}
        />
      </TestPlanningProviders>,
      { container }
    );

    stdin.write('t');
    await flushAsync();

    expect(currentActiveIntent).toBe('auth');
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
      listIntentsUseCase: mockListIntentsUseCase,
      generatePlanUseCase: mockGeneratePlanUseCase as any,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <TestPlanningProviders container={container}>
        <IntentsScreen
          initialIntents={mockIntents}
          container={container}
          isInteractive={true}
        />
      </TestPlanningProviders>,
      { container }
    );

    // Trigger plan generation on first intent ('auth')
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
