import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { App } from '../../../src/cli/tui/App.js';
import {
  renderWithProviders,
  createMockContainer,
  setupInitializedWorkspace,
  flushAsync,
} from './helpers/renderWithProviders.js';
import { InMemoryWorkspaceGateway } from '../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../helpers/in-memory-agent-runner.js';
import { createAppContainer } from '../../../src/infrastructure/container.js';


describe('App - PlanningProvider Integration and Background Execution (Flow 1)', () => {
  it('persists background plan generation when switching tabs and notifies on StatusBar', async () => {
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

    // 1. Render App in Specs tab
    const { lastFrame, stdin } = renderWithProviders(
      <App container={container} initialTab="specs" />,
      { container },
    );
    await flushAsync();

    expect(lastFrame()).toContain('Specifications');
    expect(lastFrame()).toContain('auth');

    // 2. Trigger plan generation with 'g' key
    stdin.write('g');
    await flushAsync();

    expect(mockGeneratePlanUseCase.execute).toHaveBeenCalledWith('auth', expect.any(String));
    expect(lastFrame()).toContain('Gerando Plano de Execução [auth]');

    // 3. Switch to Tasks tab (pressing '3') and verify SpecsScreen unmounts while execution continues in background
    stdin.write('3');
    await flushAsync();

    const tasksFrame = lastFrame() ?? '';
    expect(tasksFrame).toContain('Tasks');
    expect(tasksFrame).not.toContain('Specifications');
    expect(tasksFrame).not.toContain('Gerando Plano de Execução');

    // 4. Wait for background use case mock resolution
    resolvePlan({ kind: 'valid' });
    await flushAsync();

    // 5. Validate that StatusBar displays temporary notification
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('✓ Plano gerado para auth');
    });

    // 6. Switch back to Specs tab (pressing '2') and validate that SpecsScreen remounts showing SpecPlanProgress card
    stdin.write('2');
    await flushAsync();

    await vi.waitFor(() => {
      const specsFrame = lastFrame() ?? '';
      expect(specsFrame).toContain('Specifications');
      expect(specsFrame).toContain('✓ Plano Gerado com Sucesso');
      expect(specsFrame).toContain('2 tarefas criadas e validadas');
    });

    // 7. Validate that switching tabs again clears the temporary notification
    stdin.write('3');
    await flushAsync();

    await vi.waitFor(() => {
      const nextFrame = lastFrame() ?? '';
      expect(nextFrame).toContain('Tasks');
      expect(nextFrame).not.toContain('✓ Plano gerado para auth');
    });
  });

  it('persists failure state in SpecPlanProgress when background generation fails', async () => {
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

    // Render in Specs tab
    const { lastFrame, stdin } = renderWithProviders(
      <App container={container} initialTab="specs" />,
      { container },
    );
    await flushAsync();

    expect(lastFrame()).toContain('Specifications');
    expect(lastFrame()).toContain('billing');

    // Trigger plan generation via 'g'
    stdin.write('g');
    await flushAsync();
    expect(lastFrame()).toContain('Gerando Plano de Execução [billing]');

    // Switch to Run tab (pressing '1')
    stdin.write('1');
    await flushAsync();
    expect(lastFrame()).toContain('[1] Run');
    expect(lastFrame()).not.toContain('Specifications');

    // Reject background use case with error
    rejectPlan(new Error('AI rate limit exceeded (429)'));
    await flushAsync();

    // Return to Specs tab (pressing '2')
    stdin.write('2');
    await flushAsync();

    // Validate that SpecPlanProgress remounts displaying persisted failure state
    await vi.waitFor(() => {
      const specsFrame = lastFrame() ?? '';
      expect(specsFrame).toContain('Specifications');
      expect(specsFrame).toContain('Falha no Planejamento');
      expect(specsFrame).toContain('AI rate limit exceeded (429)');
    });
  });
});

describe('App - Onboarding Wizard Integration and Navigation', () => {
  it('transitions to normal TUI after onboarding completion in same process and subsequent runs do not reopen onboarding', async () => {
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

    // 1. Initializes in onboarding
    expect(lastFrame() ?? '').toContain('Deterministic workflows for AI coding agents');
    expect(lastFrame() ?? '').not.toContain('[1] Run');

    // 2. Welcome -> Enter -> Spec Source
    stdin.write('\r');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Specification Source');

    // 3. Spec Source -> Enter (selects Local) -> Environment
    stdin.write('\r');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Execution Environment');

    // 4. Environment -> Enter (local) -> Agents
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('1. Planner');
    });

    // 5. Agents -> Enter (planner: default) -> Enter (executor: default) -> CLI
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('Confirm Executor');
    });
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('Environment CLI');
    });

    // 6. CLI install -> Enter (local environment does not require CLI) -> Hooks
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('Continuar / Pular para o Resum');
    });

    // 7. Hooks -> Enter (continue without hooks) -> Summary
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('Configuration Summary');
    });

    // 8. Summary -> Enter (Forge Workspace)
    stdin.write('\r');
    await flushAsync(50);

    // 9. Await celebration and transition to normal TUI
    await vi.waitFor(
      () => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('CodeForge');
        expect(frame).not.toContain('\u2692');
        expect(frame).toContain('[2] Specs');
        expect(frame).not.toContain('Deterministic workflows for AI coding agents');
      },
      { timeout: 3000 },
    );

    // 10. Verify that workspace files and config were persisted
    expect(container.gw.exists('.codeforge/metadata.json')).toBe(true);
    expect(container.gw.exists('.codeforge/config.yaml')).toBe(true);

    // 11. In subsequent execution with same container, directly opens normal TUI
    const nextRender = renderWithProviders(
      <App container={container} initialTab="specs" />,
      { container },
    );
    expect(nextRender.lastFrame() ?? '').toContain('CodeForge');
    expect(nextRender.lastFrame() ?? '').not.toContain('\u2692');
    expect(nextRender.lastFrame() ?? '').toContain('[2] Specs');
    expect(nextRender.lastFrame() ?? '').not.toContain('Deterministic workflows for AI coding agents');
  });
});
