import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { App, isWorkspaceInitialized } from '../../../src/cli/tui/App.js';
import {
  renderWithProviders,
  createMockContainer,
  createInitializedContainer,
  setupInitializedWorkspace,
  flushAsync,
} from './helpers/renderWithProviders.js';
import { InMemoryWorkspaceGateway } from '../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../helpers/in-memory-agent-runner.js';
import { createAppContainer } from '../../../src/infrastructure/container.js';

describe('App - Smoke Tests do Layout e Navegação Global', () => {
  it('renderiza o layout inicial com cabeçalho e abas', () => {
    const container = createInitializedContainer();
    const { lastFrame } = renderWithProviders(
      <App container={container} initialTab="run" />,
      { container },
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('\u2692 CodeForge');
    expect(output).toContain('[1] Run');
    expect(output).toContain('[2] Specs');
    expect(output).toContain('[3] Tasks');
    expect(output).toContain('[4] Docs');
    expect(output).toContain('[5] Config');
    expect(output).toContain(String.fromCodePoint(0x2500).repeat(9));
  });

  it('alterna abas quando as teclas numéricas 1-5 são acionadas', async () => {
    const container = createInitializedContainer();
    const { lastFrame, stdin } = renderWithProviders(
      <App container={container} initialTab="run" />,
      { container },
    );

    // Pressionar '2' -> Aba Specs
    stdin.write('2');
    await flushAsync();
    expect(lastFrame()).toContain('Specifications');

    // Pressionar '3' -> Aba Tasks
    stdin.write('3');
    await flushAsync();
    expect(lastFrame()).toContain('Tasks');

    // Pressionar '4' -> Aba Docs
    stdin.write('4');
    await flushAsync();
    expect(lastFrame()).toContain('Docs');

    // Pressionar '5' -> Aba Config
    stdin.write('5');
    await flushAsync();
    expect(lastFrame()).toContain('CodeForge Configuration Editor');

    // Pressionar '1' -> Retorna para Aba Run
    stdin.write('1');
    await flushAsync();
    expect(lastFrame()).toContain('[1] Run');
  });
});

describe('App - Integração de PlanningProvider e Background Execution (Fluxo 1)', () => {
  it('persiste a geração de plano em background ao alternar entre abas e notifica na StatusBar', async () => {
    const gw = new InMemoryWorkspaceGateway();
    setupInitializedWorkspace(gw);
    const runner = new InMemoryAgentRunner();

    gw.mkdir('.codeforge/specs');
    gw.writeFile('.codeforge/specs/auth.md', '# Authentication Module\nSpec description');
    gw.mkdir('.codeforge/tasks/auth');
    gw.writeFile(
      '.codeforge/tasks/auth/TASK-001.json',
      JSON.stringify({ id: 'TASK-001', title: 'Task 1' }),
    );
    gw.writeFile(
      '.codeforge/tasks/auth/TASK-002.json',
      JSON.stringify({ id: 'TASK-002', title: 'Task 2' }),
    );

    let resolvePlan!: (value: any) => void;
    const planPromise = new Promise((resolve) => {
      resolvePlan = resolve;
    });

    const mockGeneratePlanUseCase = {
      execute: vi.fn().mockImplementation(() => planPromise),
    };

    const container = createAppContainer(gw, {
      runnerProvider: () => runner,
      generatePlanUseCase: mockGeneratePlanUseCase as any,
    });

    // 1. Renderizar o App na aba Specs
    const { lastFrame, stdin } = renderWithProviders(
      <App container={container} initialTab="specs" />,
      { container },
    );
    await flushAsync();

    expect(lastFrame()).toContain('Specifications');
    expect(lastFrame()).toContain('auth');

    // 2. Iniciar geração de plano via tecla 'g'
    stdin.write('g');
    await flushAsync();

    expect(mockGeneratePlanUseCase.execute).toHaveBeenCalledWith('auth', expect.any(String));
    expect(lastFrame()).toContain('Gerando Plano de Execução [auth]');

    // 3. Alternar para a aba Tasks (pressionando '3') e verificar que a tela SpecsScreen é desmontada mas a execução prossegue em segundo plano
    stdin.write('3');
    await flushAsync();

    const tasksFrame = lastFrame() ?? '';
    expect(tasksFrame).toContain('Tasks');
    expect(tasksFrame).not.toContain('Specifications');
    expect(tasksFrame).not.toContain('Gerando Plano de Execução');

    // 4. Aguardar a resolução do mock do use case em background
    resolvePlan({ kind: 'valid' });
    await flushAsync();

    // 5. Validar que a StatusBar exibe a mensagem de notificação temporária ('✓ Plano gerado para ...')
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('✓ Plano gerado para auth');
    });

    // 6. Alternar de volta para a aba Specs (pressionando '2') e validar que a SpecsScreen remonta exibindo o card SpecPlanProgress com o resumo de sucesso persistido
    stdin.write('2');
    await flushAsync();

    await vi.waitFor(() => {
      const specsFrame = lastFrame() ?? '';
      expect(specsFrame).toContain('Specifications');
      expect(specsFrame).toContain('✓ Plano Gerado com Sucesso');
      expect(specsFrame).toContain('2 tarefas criadas e validadas');
    });

    // 7. Validar que ao trocar novamente de aba a notificação temporária é dissipada
    stdin.write('3');
    await flushAsync();

    await vi.waitFor(() => {
      const nextFrame = lastFrame() ?? '';
      expect(nextFrame).toContain('Tasks');
      expect(nextFrame).not.toContain('✓ Plano gerado para auth');
    });
  });

  it('mantém o estado de erro persistido no SpecPlanProgress ao falhar a geração em background', async () => {
    const gw = new InMemoryWorkspaceGateway();
    setupInitializedWorkspace(gw);
    const runner = new InMemoryAgentRunner();

    gw.mkdir('.codeforge/specs');
    gw.writeFile('.codeforge/specs/billing.md', '# Billing Module\nSpec description');

    let rejectPlan!: (reason: any) => void;
    const planPromise = new Promise((_, reject) => {
      rejectPlan = reject;
    });

    const mockGeneratePlanUseCase = {
      execute: vi.fn().mockImplementation(() => planPromise),
    };

    const container = createAppContainer(gw, {
      runnerProvider: () => runner,
      generatePlanUseCase: mockGeneratePlanUseCase as any,
    });

    // Renderizar na aba Specs
    const { lastFrame, stdin } = renderWithProviders(
      <App container={container} initialTab="specs" />,
      { container },
    );
    await flushAsync();

    expect(lastFrame()).toContain('Specifications');
    expect(lastFrame()).toContain('billing');

    // Iniciar geração de plano via 'g'
    stdin.write('g');
    await flushAsync();
    expect(lastFrame()).toContain('Gerando Plano de Execução [billing]');

    // Mudar para a aba Run (pressionando '1')
    stdin.write('1');
    await flushAsync();
    expect(lastFrame()).toContain('[1] Run');
    expect(lastFrame()).not.toContain('Specifications');

    // Rejeitar use case em background com erro
    rejectPlan(new Error('AI rate limit exceeded (429)'));
    await flushAsync();

    // Retornar para a aba Specs (pressionando '2')
    stdin.write('2');
    await flushAsync();

    // Validar que o SpecPlanProgress remonta exibindo o estado de falha persistido
    await vi.waitFor(() => {
      const specsFrame = lastFrame() ?? '';
      expect(specsFrame).toContain('Specifications');
      expect(specsFrame).toContain('Falha no Planejamento');
      expect(specsFrame).toContain('AI rate limit exceeded (429)');
    });
  });
});

describe('App - Detecção de Inicialização e Onboarding Wizard', () => {
  it('abre diretamente o OnboardingWizard em tela cheia em workspace virgem (sem Header, TabBar ou StatusBar)', () => {
    const container = createMockContainer();
    const { lastFrame } = renderWithProviders(<App container={container} />, { container });
    const output = lastFrame() ?? '';

    expect(output).toContain('Deterministic workflows for AI coding agents');
    expect(output).toContain('[Enter] Começar Configuração');
    expect(output).not.toContain('\u2692 CodeForge');
    expect(output).not.toContain('[1] Run');
    expect(output).not.toContain('[2] Specs');
    expect(output).not.toContain('[5] Config');
  });

  it('ativa o onboarding quando a metadata está ausente, mesmo com config.yaml presente', () => {
    const container = createMockContainer();
    container.gw.mkdir('.codeforge');
    container.gw.writeFile(
      '.codeforge/config.yaml',
      'environment: local\nplannerAgent: default\nexecutorAgent: default\n',
    );
    const { lastFrame } = renderWithProviders(<App container={container} />, { container });
    const output = lastFrame() ?? '';

    expect(output).toContain('Deterministic workflows for AI coding agents');
    expect(output).not.toContain('[1] Run');
  });

  it('ativa o onboarding quando metadata.json indica initialized: false', () => {
    const container = createMockContainer();
    container.gw.mkdir('.codeforge');
    container.gw.writeFile('.codeforge/metadata.json', JSON.stringify({ initialized: false }));
    container.gw.writeFile(
      '.codeforge/config.yaml',
      'environment: local\nplannerAgent: default\nexecutorAgent: default\n',
    );
    const { lastFrame } = renderWithProviders(<App container={container} />, { container });
    const output = lastFrame() ?? '';

    expect(output).toContain('Deterministic workflows for AI coding agents');
  });

  it('ativa o onboarding quando config.yaml está ausente, mesmo com metadata.json presente', () => {
    const container = createMockContainer();
    container.gw.mkdir('.codeforge');
    container.gw.writeFile('.codeforge/metadata.json', JSON.stringify({ initialized: true }));
    const { lastFrame } = renderWithProviders(<App container={container} />, { container });
    const output = lastFrame() ?? '';

    expect(output).toContain('Deterministic workflows for AI coding agents');
  });

  it('ativa o onboarding quando config.yaml possui campos mínimos ausentes ou vazios', () => {
    // Missing environment
    const c1 = createMockContainer();
    c1.gw.mkdir('.codeforge');
    c1.gw.writeFile('.codeforge/metadata.json', JSON.stringify({ initialized: true }));
    c1.gw.writeFile('.codeforge/config.yaml', 'plannerAgent: default\nexecutorAgent: default\n');
    const { lastFrame: f1 } = renderWithProviders(<App container={c1} />, { container: c1 });
    expect(f1() ?? '').toContain('Deterministic workflows for AI coding agents');
    // Missing plannerAgent
    const c2 = createMockContainer();
    c2.gw.mkdir('.codeforge');
    c2.gw.writeFile('.codeforge/metadata.json', JSON.stringify({ initialized: true }));
    c2.gw.writeFile('.codeforge/config.yaml', 'environment: local\nexecutorAgent: default\n');
    const { lastFrame: f2 } = renderWithProviders(<App container={c2} />, { container: c2 });
    expect(f2() ?? '').toContain('Deterministic workflows for AI coding agents');

    // Missing executorAgent
    const c3 = createMockContainer();
    c3.gw.mkdir('.codeforge');
    c3.gw.writeFile('.codeforge/metadata.json', JSON.stringify({ initialized: true }));
    c3.gw.writeFile('.codeforge/config.yaml', 'environment: local\nplannerAgent: default\n');
    const { lastFrame: f3 } = renderWithProviders(<App container={c3} />, { container: c3 });
    expect(f3() ?? '').toContain('Deterministic workflows for AI coding agents');

    // Empty environment field
    const c4 = createMockContainer();
    c4.gw.mkdir('.codeforge');
    c4.gw.writeFile('.codeforge/metadata.json', JSON.stringify({ initialized: true }));
    c4.gw.writeFile(
      '.codeforge/config.yaml',
      'environment: "   "\nplannerAgent: default\nexecutorAgent: default\n',
    );
    const { lastFrame: f4 } = renderWithProviders(<App container={c4} />, { container: c4 });
    expect(f4() ?? '').toContain('Deterministic workflows for AI coding agents');
  });

  it('abre a TUI normal quando o workspace possui metadata válida e config com campos mínimos preenchidos', () => {
    const container = createInitializedContainer();
    const { lastFrame } = renderWithProviders(<App container={container} initialTab="specs" />, {
      container,
    });
    const output = lastFrame() ?? '';

    expect(output).toContain('\u2692 CodeForge');
    expect(output).toContain('[1] Run');
    expect(output).toContain('[2] Specs');
    expect(output).not.toContain('Deterministic workflows for AI coding agents');
  });

  it('avança pelos passos com Enter e retrocede com b durante o onboarding dentro do App', async () => {
    const container = createMockContainer();
    const { lastFrame, stdin } = renderWithProviders(<App container={container} />, { container });

    expect(lastFrame() ?? '').toContain('Deterministic workflows for AI coding agents');

    stdin.write('\r');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Fonte das especificações');

    stdin.write('b');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Deterministic workflows for AI coding agents');
  });

  it('transiciona para a TUI normal após conclusão do onboarding no mesmo processo e execuções posteriores não reabrem o onboarding', async () => {
    const mockConfigureEnv = {
      getAvailableEnvironments: () => ['local'],
      getAgentsForEnvironment: async () => ['default'],
    };

    const container = createMockContainer({
      configureEnvironmentUseCase: mockConfigureEnv as any,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <App container={container} initialTab="specs" />,
      { container },
    );

    // 1. Inicializa no onboarding
    expect(lastFrame() ?? '').toContain('Deterministic workflows for AI coding agents');
    expect(lastFrame() ?? '').not.toContain('[1] Run');

    // 2. Welcome -> Enter -> Spec Source
    stdin.write('\r');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Fonte das especificações');

    // 3. Spec Source -> Enter (seleciona Local) -> Environment
    stdin.write('\r');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Ambiente de execução');

    // 4. Environment -> Enter (local) -> Agentes
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('1. Planner');
    });

    // 5. Agentes -> Enter (planner: default) -> Enter (executor: default) -> CLI
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('Confirmar Executor');
    });
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('CLI do ambiente');
    });

    // 6. CLI install -> Enter (ambiente local não requer CLI) -> Hooks
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('Continuar / Pular para o Resumo');
    });

    // 7. Hooks -> Enter (continuar sem hooks) -> Resumo
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('Resumo da Configuração');
    });

    // 8. Resumo -> Enter (Forjar Workspace)
    stdin.write('\r');
    await flushAsync(50);

    // 9. Aguarda celebração e transição para TUI normal
    await vi.waitFor(
      () => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('\u2692 CodeForge');
        expect(frame).toContain('[2] Specs');
        expect(frame).not.toContain('Deterministic workflows for AI coding agents');
      },
      { timeout: 3000 },
    );

    // 10. Verifica que os arquivos do workspace e config foram persistidos
    expect(container.gw.exists('.codeforge/metadata.json')).toBe(true);
    expect(container.gw.exists('.codeforge/config.yaml')).toBe(true);

    // 11. Em execução subsequente com o mesmo container, abre diretamente a TUI normal
    const nextRender = renderWithProviders(
      <App container={container} initialTab="specs" />,
      { container },
    );
    expect(nextRender.lastFrame() ?? '').toContain('\u2692 CodeForge');
    expect(nextRender.lastFrame() ?? '').toContain('[2] Specs');
    expect(nextRender.lastFrame() ?? '').not.toContain('Deterministic workflows for AI coding agents');
  });
});
