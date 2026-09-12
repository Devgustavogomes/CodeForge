import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { App } from '../../../src/cli/tui/App.js';
import { renderWithProviders, createMockContainer, flushAsync } from './helpers/renderWithProviders.js';
import { InMemoryWorkspaceGateway } from '../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../helpers/in-memory-agent-runner.js';
import { createAppContainer } from '../../../src/infrastructure/container.js';

describe('App - Smoke Tests do Layout e Navegação Global', () => {
  it('renderiza o layout inicial com cabeçalho e abas', () => {
    const container = createMockContainer();
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
    const container = createMockContainer();
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
