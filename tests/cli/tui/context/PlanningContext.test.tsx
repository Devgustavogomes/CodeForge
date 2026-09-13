import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  PlanningProvider,
  usePlanning,
  PlanningContextValue,
} from '../../../../src/cli/tui/context/PlanningContext.js';
import { AppContainer, createAppContainer, AppContainerDependencies } from '../../../../src/infrastructure/container.js';
import { InMemoryWorkspaceGateway } from '../../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../../helpers/in-memory-agent-runner.js';
import { flushAsync } from '../helpers/flushAsync.js';

describe('PlanningContext & PlanningProvider', () => {
  let gw: InMemoryWorkspaceGateway;
  let runner: InMemoryAgentRunner;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    runner = new InMemoryAgentRunner();
  });

  function createTestContainer(overrides?: Partial<AppContainerDependencies>): AppContainer {
    return createAppContainer(gw, {
      runnerProvider: () => runner,
      ...overrides,
    });
  }

  it('lança erro informativo se usePlanning for utilizado fora de um PlanningProvider', () => {
    let capturedError: unknown;
    const BadConsumer = () => {
      try {
        usePlanning();
      } catch (err) {
        capturedError = err;
      }
      return null;
    };

    render(<BadConsumer />);
    expect((capturedError as Error)?.message).toBe('usePlanning must be used within a PlanningProvider');
  });

  it('inicializa com os valores padrão corretos', () => {
    const container = createTestContainer();
    let captured!: PlanningContextValue;
    const TestConsumer = () => {
      captured = usePlanning();
      return <Text>Generating: {String(captured.isGenerating)}</Text>;
    };

    const { unmount } = render(
      <PlanningProvider container={container}>
        <TestConsumer />
      </PlanningProvider>,
    );

    expect(captured.isGenerating).toBe(false);
    expect(captured.generatingSpecName).toBeNull();
    expect(captured.startTime).toBeNull();
    expect(captured.endTime).toBeNull();
    expect(captured.result).toBeNull();
    expect(captured.validationErrors).toBeNull();
    expect(captured.statusNotification).toBeNull();
    expect(typeof captured.generatePlan).toBe('function');
    expect(typeof captured.clearPlanResult).toBe('function');
    expect(typeof captured.clearStatusNotification).toBe('function');

    unmount();
  });

  it('executa fluxo de sucesso na geração de plano com parâmetros corretos e notificação temporária', async () => {
    gw.mkdir('.codeforge/tasks/auth-spec');
    gw.writeFile('.codeforge/tasks/auth-spec/TASK-001.json', JSON.stringify({ id: 'TASK-001' }));
    gw.writeFile('.codeforge/tasks/auth-spec/TASK-002.json', JSON.stringify({ id: 'TASK-002' }));

    let resolvePlan!: (value: unknown) => void;
    const planPromise = new Promise((resolve) => {
      resolvePlan = resolve;
    });

    const executeSpy = vi.fn().mockImplementation(() => planPromise);
    const mockConfigService = {
      loadConfig: vi.fn().mockReturnValue({ plannerAgent: 'gpt-4o' }),
    };

    const container = createTestContainer({
      generatePlanUseCase: {
        execute: executeSpy,
      } as unknown as AppContainer['generatePlanUseCase'],
      configService: mockConfigService as unknown as AppContainer['configService'],
    });

    let captured!: PlanningContextValue;
    const TestConsumer = () => {
      captured = usePlanning();
      return <Text>Status: {captured.isGenerating ? 'generating' : 'idle'}</Text>;
    };

    const { unmount } = render(
      <PlanningProvider container={container}>
        <TestConsumer />
      </PlanningProvider>,
    );

    const promise = captured.generatePlan('auth-spec');

    await vi.waitFor(() => {
      expect(captured.isGenerating).toBe(true);
      expect(captured.generatingSpecName).toBe('auth-spec');
      expect(captured.startTime).toBeTypeOf('number');
      expect(captured.endTime).toBeNull();
    });

    resolvePlan({ kind: 'valid' });
    await promise;

    await vi.waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith('auth-spec', 'gpt-4o');
      expect(captured.isGenerating).toBe(false);
      expect(captured.generatingSpecName).toBe('auth-spec');
      expect(captured.endTime).toBeTypeOf('number');
      expect(captured.endTime).toBeGreaterThanOrEqual(captured.startTime!);
      expect(captured.result).toEqual({
        kind: 'valid',
        taskCount: 2,
      });
      expect(captured.validationErrors).toBeNull();
      expect(captured.statusNotification).toBe('✓ Plano gerado para auth-spec');
    });

    unmount();
  });

  it('dissipa a notificação de status após 5 segundos automaticamente', async () => {
    vi.useFakeTimers();

    const container = createTestContainer({
      generatePlanUseCase: {
        execute: vi.fn().mockResolvedValue({ kind: 'valid' }),
      } as unknown as AppContainer['generatePlanUseCase'],
    });

    let captured!: PlanningContextValue;
    const TestConsumer = () => {
      captured = usePlanning();
      return <Text>Notification: {captured.statusNotification ?? 'none'}</Text>;
    };

    const { unmount } = render(
      <PlanningProvider container={container}>
        <TestConsumer />
      </PlanningProvider>,
    );

    const planPromise = captured.generatePlan('billing-spec');
    await planPromise;

    // Aguarda renderização pós término
    await vi.waitFor(() => {
      expect(captured.statusNotification).toBe('✓ Plano gerado para billing-spec');
    });

    // Avança 4.9s
    vi.advanceTimersByTime(4900);
    expect(captured.statusNotification).toBe('✓ Plano gerado para billing-spec');

    // Avança mais 200ms (> 5s total)
    vi.advanceTimersByTime(200);
    await vi.waitFor(() => {
      expect(captured.statusNotification).toBeNull();
    });

    vi.useRealTimers();
    unmount();
  });

  it('lida com retorno de validação inválida salvando os erros de validação no contexto', async () => {
    const validationErrors = [
      'Task TASK-001 has no description',
      'Dependency cycle between TASK-001 and TASK-002',
    ];
    const container = createTestContainer({
      generatePlanUseCase: {
        execute: vi.fn().mockResolvedValue({
          kind: 'invalid',
          errors: validationErrors,
        }),
      } as unknown as AppContainer['generatePlanUseCase'],
    });

    let captured!: PlanningContextValue;
    const TestConsumer = () => {
      captured = usePlanning();
      return <Text>Generating: {String(captured.isGenerating)}</Text>;
    };

    const { unmount } = render(
      <PlanningProvider container={container}>
        <TestConsumer />
      </PlanningProvider>,
    );

    await captured.generatePlan('broken-spec');

    await vi.waitFor(() => {
      expect(captured.isGenerating).toBe(false);
      expect(captured.result).toEqual({
        kind: 'invalid',
        errors: validationErrors,
      });
      expect(captured.validationErrors).toEqual(validationErrors);
      expect(captured.statusNotification).toBeNull();
    });

    unmount();
  });

  it('lida com outros tipos de retorno como spec-not-found', async () => {
    const container = createTestContainer({
      generatePlanUseCase: {
        execute: vi.fn().mockResolvedValue({
          kind: 'spec-not-found',
        }),
      } as unknown as AppContainer['generatePlanUseCase'],
    });

    let captured!: PlanningContextValue;
    const TestConsumer = () => {
      captured = usePlanning();
      return <Text>Generating: {String(captured.isGenerating)}</Text>;
    };

    const { unmount } = render(
      <PlanningProvider container={container}>
        <TestConsumer />
      </PlanningProvider>,
    );

    await captured.generatePlan('missing-spec');

    await vi.waitFor(() => {
      expect(captured.isGenerating).toBe(false);
      expect(captured.result).toEqual({
        kind: 'spec-not-found',
        message: 'Plan generation failed: spec-not-found',
      });
      expect(captured.validationErrors).toBeNull();
    });

    unmount();
  });

  it('captura exceções lançadas durante a execução e reflete o erro nos estados do contexto', async () => {
    const container = createTestContainer({
      generatePlanUseCase: {
        execute: vi.fn().mockRejectedValue(new Error('LLM rate limit reached (429)')),
      } as unknown as AppContainer['generatePlanUseCase'],
    });

    let captured!: PlanningContextValue;
    const TestConsumer = () => {
      captured = usePlanning();
      return <Text>Generating: {String(captured.isGenerating)}</Text>;
    };

    const { unmount } = render(
      <PlanningProvider container={container}>
        <TestConsumer />
      </PlanningProvider>,
    );

    await captured.generatePlan('failing-spec');

    await vi.waitFor(() => {
      expect(captured.isGenerating).toBe(false);
      expect(captured.result).toEqual({
        kind: 'error',
        message: 'LLM rate limit reached (429)',
      });
      expect(captured.validationErrors).toBeNull();
      expect(captured.endTime).toBeTypeOf('number');
    });

    unmount();
  });

  it('bloqueia concorrência entre gerações simultâneas emitindo a mensagem exata de erro', async () => {
    let resolveFirstPlan!: (value: unknown) => void;
    const firstPlanPromise = new Promise((resolve) => {
      resolveFirstPlan = resolve;
    });

    const executeSpy = vi.fn().mockImplementation((specName: string) => {
      if (specName === 'spec-alpha') {
        return firstPlanPromise;
      }
      return Promise.resolve({ kind: 'valid' });
    });

    const container = createTestContainer({
      generatePlanUseCase: {
        execute: executeSpy,
      } as unknown as AppContainer['generatePlanUseCase'],
    });

    let captured!: PlanningContextValue;
    const TestConsumer = () => {
      captured = usePlanning();
      return <Text>Active: {captured.generatingSpecName ?? 'none'}</Text>;
    };

    const { unmount } = render(
      <PlanningProvider container={container}>
        <TestConsumer />
      </PlanningProvider>,
    );

    const firstCall = captured.generatePlan('spec-alpha');

    await vi.waitFor(() => {
      expect(captured.isGenerating).toBe(true);
      expect(captured.generatingSpecName).toBe('spec-alpha');
    });

    await expect(captured.generatePlan('spec-beta')).rejects.toThrow(
      'Já existe um plano sendo gerado para "spec-alpha". Aguarde a conclusão.',
    );

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith('spec-alpha', 'default');
    expect(captured.generatingSpecName).toBe('spec-alpha');
    expect(captured.isGenerating).toBe(true);

    resolveFirstPlan({ kind: 'valid' });
    await firstCall;

    await vi.waitFor(() => {
      expect(captured.isGenerating).toBe(false);
    });

    await captured.generatePlan('spec-beta');
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(executeSpy).toHaveBeenLastCalledWith('spec-beta', 'default');

    unmount();
  });

  it('permite limpar o resultado do plano e a notificação de status manualmente', async () => {
    const container = createTestContainer({
      generatePlanUseCase: {
        execute: vi.fn().mockResolvedValue({ kind: 'valid' }),
      } as unknown as AppContainer['generatePlanUseCase'],
    });

    let captured!: PlanningContextValue;
    const TestConsumer = () => {
      captured = usePlanning();
      return <Text>Result: {captured.result?.kind ?? 'none'}</Text>;
    };

    const { unmount } = render(
      <PlanningProvider container={container}>
        <TestConsumer />
      </PlanningProvider>,
    );

    await captured.generatePlan('clean-test');

    await vi.waitFor(() => {
      expect(captured.result).not.toBeNull();
      expect(captured.statusNotification).toBe('✓ Plano gerado para clean-test');
      expect(captured.generatingSpecName).toBe('clean-test');
    });

    captured.clearPlanResult();

    await vi.waitFor(() => {
      expect(captured.result).toBeNull();
      expect(captured.validationErrors).toBeNull();
      expect(captured.startTime).toBeNull();
      expect(captured.endTime).toBeNull();
      expect(captured.generatingSpecName).toBeNull();
      expect(captured.statusNotification).toBe('✓ Plano gerado para clean-test');
    });

    captured.clearStatusNotification();

    await vi.waitFor(() => {
      expect(captured.statusNotification).toBeNull();
    });

    unmount();
  });

  it('persiste os estados da geração de plano mesmo quando componentes filhos são desmontados e remontados', async () => {
    const container = createTestContainer({
      generatePlanUseCase: {
        execute: vi.fn().mockResolvedValue({ kind: 'valid' }),
      } as unknown as AppContainer['generatePlanUseCase'],
    });

    let capturedA!: PlanningContextValue;
    let capturedB!: PlanningContextValue;

    const ConsumerA = () => {
      capturedA = usePlanning();
      return <Text>Consumer A: {capturedA.generatingSpecName}</Text>;
    };

    const ConsumerB = () => {
      capturedB = usePlanning();
      return <Text>Consumer B: {capturedB.generatingSpecName}</Text>;
    };

    const ParentSwitch = ({ showA }: { showA: boolean }) => {
      return (
        <PlanningProvider container={container}>
          {showA ? <ConsumerA /> : <ConsumerB />}
        </PlanningProvider>
      );
    };

    const { rerender, unmount } = render(<ParentSwitch showA={true} />);

    await capturedA.generatePlan('persistent-spec');

    await vi.waitFor(() => {
      expect(capturedA.result?.kind).toBe('valid');
      expect(capturedA.generatingSpecName).toBe('persistent-spec');
    });

    rerender(<ParentSwitch showA={false} />);
    await flushAsync(5);

    await vi.waitFor(() => {
      expect(capturedB.result?.kind).toBe('valid');
      expect(capturedB.generatingSpecName).toBe('persistent-spec');
      expect(capturedB.isGenerating).toBe(false);
      expect(capturedB.statusNotification).toBe('✓ Plano gerado para persistent-spec');
    });

    unmount();
  });
});
