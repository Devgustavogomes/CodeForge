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
import { ConfigProvider, useConfig } from '../../../../src/cli/tui/context/ConfigContext.js';
import { ContainerProvider } from '../../../../src/cli/tui/context/ContainerContext.js';

const TestPlanningProviders: React.FC<React.PropsWithChildren<{ container: AppContainer }>> = ({ container, children }) => (
  <ContainerProvider container={container}>
    <ConfigProvider>
      <PlanningProvider container={container}>{children}</PlanningProvider>
    </ConfigProvider>
  </ContainerProvider>
);

describe('PlanningContext & PlanningProvider', () => {
  let gw: InMemoryWorkspaceGateway;
  let runner: InMemoryAgentRunner;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    runner = new InMemoryAgentRunner();
  });

  it('uses the latest planner agent and environment for each plan generation', async () => {
    const oldRunner = new InMemoryAgentRunner({ handler: () => {
      gw.mkdir('.codeforge');
      gw.writeFile('.codeforge/tasks/first/TASK-001.json', JSON.stringify({ id: 'TASK-001', title: 'First', description: 'First task', acceptanceCriteria: ['Done'] }));
      gw.writeFile('.codeforge/tasks/second/TASK-001.json', JSON.stringify({ id: 'TASK-001', title: 'Second', description: 'Second task', acceptanceCriteria: ['Done'] }));
    } });
    const newRunner = new InMemoryAgentRunner({ handler: () => {
      gw.mkdir('.codeforge');
      gw.writeFile('.codeforge/tasks/second/TASK-002.json', JSON.stringify({ id: 'TASK-002', title: 'Second task', description: 'New task', acceptanceCriteria: ['Done'] }));
    } });
    const runnerProvider = vi.fn((environment: string) => environment === 'local' ? oldRunner : newRunner);
    const container = createTestContainer({
      runnerProvider,
      configService: { loadConfig: () => ({ environment: 'local', plannerAgent: 'planner-old', executorAgent: 'default', language: 'en' }) } as unknown as AppContainer['configService'],
    });
    let captured!: PlanningContextValue;
    let updateConfig!: ReturnType<typeof useConfig>['updateConfig'];
    const ConfigConsumer = () => {
      const config = useConfig();
      updateConfig = config.updateConfig;
      return <Text>Config: {config.config.environment}/{config.config.plannerAgent}</Text>;
    };
    const PlanConsumer = () => { captured = usePlanning(); return null; };
    const { unmount, lastFrame } = render(
      <ContainerProvider container={container}><ConfigProvider>
        <ConfigConsumer /><PlanningProvider container={container}><PlanConsumer /></PlanningProvider>
      </ConfigProvider></ContainerProvider>,
    );

    gw.writeFile('.codeforge/intents/first.md', 'first intent');
    gw.writeFile('.codeforge/intents/second.md', 'second intent');
    gw.writeFile('.codeforge/metadata.json', '{}');
    await captured.generatePlan('first');
    updateConfig({ environment: 'staging', plannerAgent: 'planner-new', executorAgent: 'executor', language: 'en', hooks: {}, intentSource: { provider: 'filesystem' } });
    await vi.waitFor(() => expect(lastFrame()).toContain('Config: staging/planner-new'));
    await captured.generatePlan('second');
    expect(oldRunner.executedContexts.length).toBeGreaterThanOrEqual(1);
    expect(oldRunner.executedContexts.some((context) => context.model === 'planner-old')).toBe(true);
    expect(newRunner.executedContexts.length).toBeGreaterThanOrEqual(1);
    expect(newRunner.executedContexts.some((context) => context.model === 'planner-new')).toBe(true);
    expect(runnerProvider).toHaveBeenCalledWith('local');
    expect(runnerProvider).toHaveBeenCalledWith('staging');
    unmount();
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
      <TestPlanningProviders container={container}>
        <TestConsumer />
      </TestPlanningProviders>,
    );

    expect(captured.isGenerating).toBe(false);
    expect(captured.generatingIntentName).toBeNull();
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
    gw.mkdir('.codeforge/tasks/auth-intent');
    gw.writeFile('.codeforge/tasks/auth-intent/TASK-001.json', JSON.stringify({ id: 'TASK-001' }));
    gw.writeFile('.codeforge/tasks/auth-intent/TASK-002.json', JSON.stringify({ id: 'TASK-002' }));

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
      <TestPlanningProviders container={container}>
        <TestConsumer />
      </TestPlanningProviders>,
    );

    const promise = captured.generatePlan('auth-intent');

    await vi.waitFor(() => {
      expect(captured.isGenerating).toBe(true);
      expect(captured.generatingIntentName).toBe('auth-intent');
      expect(captured.startTime).toBeTypeOf('number');
      expect(captured.endTime).toBeNull();
    });

    resolvePlan({ kind: 'valid' });
    await promise;

    await vi.waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith('auth-intent', 'gpt-4o');
      expect(captured.isGenerating).toBe(false);
      expect(captured.generatingIntentName).toBe('auth-intent');
      expect(captured.endTime).toBeTypeOf('number');
      expect(captured.endTime).toBeGreaterThanOrEqual(captured.startTime!);
      expect(captured.result).toEqual({
        kind: 'valid',
        taskCount: 2,
      });
      expect(captured.validationErrors).toBeNull();
      expect(captured.statusNotification).toBe('✓ Plano gerado para auth-intent');
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
      <TestPlanningProviders container={container}>
        <TestConsumer />
      </TestPlanningProviders>,
    );

    const planPromise = captured.generatePlan('billing-intent');
    await planPromise;

    // Aguarda renderização pós término
    await vi.waitFor(() => {
      expect(captured.statusNotification).toBe('✓ Plano gerado para billing-intent');
    });

    // Avança 4.9s
    vi.advanceTimersByTime(4900);
    expect(captured.statusNotification).toBe('✓ Plano gerado para billing-intent');

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
      <TestPlanningProviders container={container}>
        <TestConsumer />
      </TestPlanningProviders>,
    );

    await captured.generatePlan('broken-intent');

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

  it('lida com outros tipos de retorno como intent-not-found', async () => {
    const container = createTestContainer({
      generatePlanUseCase: {
        execute: vi.fn().mockResolvedValue({
          kind: 'intent-not-found',
        }),
      } as unknown as AppContainer['generatePlanUseCase'],
    });

    let captured!: PlanningContextValue;
    const TestConsumer = () => {
      captured = usePlanning();
      return <Text>Generating: {String(captured.isGenerating)}</Text>;
    };

    const { unmount } = render(
      <TestPlanningProviders container={container}>
        <TestConsumer />
      </TestPlanningProviders>,
    );

    await captured.generatePlan('missing-intent');

    await vi.waitFor(() => {
      expect(captured.isGenerating).toBe(false);
      expect(captured.result).toEqual({
        kind: 'intent-not-found',
        message: 'Plan generation failed: intent-not-found',
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
      <TestPlanningProviders container={container}>
        <TestConsumer />
      </TestPlanningProviders>,
    );

    await captured.generatePlan('failing-intent');

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

    const executeSpy = vi.fn().mockImplementation((intentName: string) => {
      if (intentName === 'intent-alpha') {
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
      return <Text>Active: {captured.generatingIntentName ?? 'none'}</Text>;
    };

    const { unmount } = render(
      <TestPlanningProviders container={container}>
        <TestConsumer />
      </TestPlanningProviders>,
    );

    const firstCall = captured.generatePlan('intent-alpha');

    await vi.waitFor(() => {
      expect(captured.isGenerating).toBe(true);
      expect(captured.generatingIntentName).toBe('intent-alpha');
    });

    await expect(captured.generatePlan('intent-beta')).rejects.toThrow(
      'Já existe um plano sendo gerado para "intent-alpha". Aguarde a conclusão.',
    );

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith('intent-alpha', 'default');
    expect(captured.generatingIntentName).toBe('intent-alpha');
    expect(captured.isGenerating).toBe(true);

    resolveFirstPlan({ kind: 'valid' });
    await firstCall;

    await vi.waitFor(() => {
      expect(captured.isGenerating).toBe(false);
    });

    await captured.generatePlan('intent-beta');
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(executeSpy).toHaveBeenLastCalledWith('intent-beta', 'default');

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
      <TestPlanningProviders container={container}>
        <TestConsumer />
      </TestPlanningProviders>,
    );

    await captured.generatePlan('clean-test');

    await vi.waitFor(() => {
      expect(captured.result).not.toBeNull();
      expect(captured.statusNotification).toBe('✓ Plano gerado para clean-test');
      expect(captured.generatingIntentName).toBe('clean-test');
    });

    captured.clearPlanResult();

    await vi.waitFor(() => {
      expect(captured.result).toBeNull();
      expect(captured.validationErrors).toBeNull();
      expect(captured.startTime).toBeNull();
      expect(captured.endTime).toBeNull();
      expect(captured.generatingIntentName).toBeNull();
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
      return <Text>Consumer A: {capturedA.generatingIntentName}</Text>;
    };

    const ConsumerB = () => {
      capturedB = usePlanning();
      return <Text>Consumer B: {capturedB.generatingIntentName}</Text>;
    };

    const ParentSwitch = ({ showA }: { showA: boolean }) => {
      return (
        <TestPlanningProviders container={container}>
          {showA ? <ConsumerA /> : <ConsumerB />}
        </TestPlanningProviders>
      );
    };

    const { rerender, unmount } = render(<ParentSwitch showA={true} />);

    await capturedA.generatePlan('persistent-intent');

    await vi.waitFor(() => {
      expect(capturedA.result?.kind).toBe('valid');
      expect(capturedA.generatingIntentName).toBe('persistent-intent');
    });

    rerender(<ParentSwitch showA={false} />);
    await flushAsync(5);

    await vi.waitFor(() => {
      expect(capturedB.result?.kind).toBe('valid');
      expect(capturedB.generatingIntentName).toBe('persistent-intent');
      expect(capturedB.isGenerating).toBe(false);
      expect(capturedB.statusNotification).toBe('✓ Plano gerado para persistent-intent');
    });

    unmount();
  });
});
