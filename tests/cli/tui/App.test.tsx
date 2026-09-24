import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { App } from '../../../src/cli/tui/App.js';
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


describe('App - PlanningProvider Integration and Background Execution (Flow 1)', () => {
  it('persists background plan generation when switching tabs and notifies on StatusBar', async () => {
    const gw = new InMemoryWorkspaceGateway();
    setupInitializedWorkspace(gw);
    const runner = new InMemoryAgentRunner();

    gw.mkdir('.codeforge/intents');
    gw.writeFile('.codeforge/intents/auth.md', '# Authentication Module\nIntent description');
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

    // 1. Render App in Intents tab
    const { lastFrame, stdin } = renderWithProviders(
      <App container={container} initialTab="intents" />,
      { container },
    );
    await flushAsync();

    expect(lastFrame()).toContain('Intents');
    expect(lastFrame()).toContain('auth');

    // 2. Trigger plan generation with 'g' key
    stdin.write('g');
    await flushAsync();

    expect(mockGeneratePlanUseCase.execute).toHaveBeenCalledWith('auth', expect.any(String));
    expect(lastFrame()).toContain('Gerando Plano de Execução [auth]');

    // 3. Switch to Tasks tab (pressing '3') and verify IntentsScreen unmounts while execution continues in background
    stdin.write('3');
    await flushAsync();

    const tasksFrame = lastFrame() ?? '';
    expect(tasksFrame).toContain('Tasks');
    expect(tasksFrame).not.toContain('Gerando Plano de Execução');

    // 4. Wait for background use case mock resolution
    resolvePlan({ kind: 'valid' });
    await flushAsync();

    // 5. Validate that StatusBar displays temporary notification
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('✓ Plano gerado para auth');
    });

    // 6. Switch back to Intents tab (pressing '2') and validate that IntentsScreen remounts showing IntentPlanProgress card
    stdin.write('2');
    await flushAsync();

    await vi.waitFor(() => {
      const intentsFrame = lastFrame() ?? '';
      expect(intentsFrame).toContain('Intents');
      expect(intentsFrame).toContain('✓ Plano Gerado com Sucesso');
      expect(intentsFrame).toContain('2 tarefas criadas e validadas');
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

  it('persists failure state in IntentPlanProgress when background generation fails', async () => {
    const gw = new InMemoryWorkspaceGateway();
    setupInitializedWorkspace(gw);
    const runner = new InMemoryAgentRunner();

    gw.mkdir('.codeforge/intents');
    gw.writeFile('.codeforge/intents/billing.md', '# Billing Module\nIntent description');

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

    // Render in Intents tab
    const { lastFrame, stdin } = renderWithProviders(
      <App container={container} initialTab="intents" />,
      { container },
    );
    await flushAsync();

    expect(lastFrame()).toContain('Intents');
    expect(lastFrame()).toContain('billing');

    // Trigger plan generation via 'g'
    stdin.write('g');
    await flushAsync();
    expect(lastFrame()).toContain('Gerando Plano de Execução [billing]');

    // Switch to Run tab (pressing '1')
    stdin.write('1');
    await flushAsync();
    expect(lastFrame()).toContain('[1] Run');

    // Reject background use case with error
    rejectPlan(new Error('AI rate limit exceeded (429)'));
    await flushAsync();

    // Return to Intents tab (pressing '2')
    stdin.write('2');
    await flushAsync();

    // Validate that IntentPlanProgress remounts displaying persisted failure state
    await vi.waitFor(() => {
      const intentsFrame = lastFrame() ?? '';
      expect(intentsFrame).toContain('Intents');
      expect(intentsFrame).toContain('Falha no Planejamento');
      expect(intentsFrame).toContain('AI rate limit exceeded (429)');
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

    const { lastFrame, stdin, unmount } = renderWithProviders(
      <App container={container} initialTab="intents" />,
      { container },
    );

    // 1. Initializes in onboarding
    expect(lastFrame() ?? '').toContain('Deterministic workflows for AI coding agents');
    expect(lastFrame() ?? '').not.toContain('[1] Run');

    // 2. Welcome -> Enter -> Intent Source
    stdin.write('\r');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Intent Source');

    // 3. Intent Source -> Enter (selects Local) -> Environment
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
        expect(frame).toContain('[2] Intents');
        expect(frame).not.toContain('Deterministic workflows for AI coding agents');
      },
      { timeout: 3000 },
    );

    // 10. Verify that workspace files and config were persisted
    expect(container.gw.exists('.codeforge/metadata.json')).toBe(true);
    expect(container.gw.exists('.codeforge/config.yaml')).toBe(true);

    unmount();

    // 11. In subsequent execution with same container, directly opens normal TUI
    const nextRender = renderWithProviders(
      <App container={container} initialTab="intents" />,
      { container },
    );
    expect(nextRender.lastFrame() ?? '').toContain('CodeForge');
    expect(nextRender.lastFrame() ?? '').not.toContain('\u2692');
    expect(nextRender.lastFrame() ?? '').toContain('[2] Intents');
    expect(nextRender.lastFrame() ?? '').not.toContain('Deterministic workflows for AI coding agents');
    nextRender.unmount();
  });
});

describe('App - Shared StatusBar Deletion Feedback Integration', () => {
  it('displays deletion feedback on shared StatusBar for intents, supports cancellation, and clears on tab switch', async () => {
    const container = createInitializedContainer();
    container.gw.mkdir('.codeforge/intents');
    container.gw.writeFile('.codeforge/intents/auth.md', '# Auth Intent');
    container.gw.writeFile('.codeforge/intents/billing.md', '# Billing Intent');

    const { lastFrame, stdin, unmount } = renderWithProviders(
      <App container={container} initialTab="intents" />,
      { container },
    );

    try {
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Intents');
        expect(frame).toContain('auth');
      });

      // 1. Cancellation test: press 'd' to open delete modal, then 'n' to cancel
      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Intent');
      });

      stdin.write('n');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).not.toContain('Delete Intent');
        expect(frame).not.toContain("Intent 'auth' deleted");
      });

      // 2. Success test: press 'd', then 'y' to confirm
      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Intent');
      });

      stdin.write('y');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain("Intent 'auth' deleted successfully.");
        expect(frame).toContain('[v]');
      });

      // 3. Tab switch clears stale feedback
      stdin.write('3'); // Switch to Tasks tab
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Tasks');
        expect(frame).not.toContain("Intent 'auth' deleted successfully.");
      });
    } finally {
      unmount();
    }
  });

  it('displays deletion failures on shared StatusBar with error presentation for intents', async () => {
    const mockDeleteIntent = {
      execute: vi.fn().mockImplementation(() => {
        throw new Error('Disk write error');
      }),
    };

    const container = createInitializedContainer({
      deleteIntentUseCase: mockDeleteIntent as any,
    });
    container.gw.mkdir('.codeforge/intents');
    container.gw.writeFile('.codeforge/intents/auth.md', '# Auth Intent');

    const { lastFrame, stdin, unmount } = renderWithProviders(
      <App container={container} initialTab="intents" />,
      { container },
    );

    try {
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('auth');
      });

      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Intent');
      });

      stdin.write('y');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain("[x] Failed to delete intent 'auth': Disk write error");
      });
    } finally {
      unmount();
    }
  });

  it('displays deletion feedback on shared StatusBar for tasks, supports cancellation, and clears on tab switch', async () => {
    const container = createInitializedContainer();
    container.gw.mkdir('.codeforge/intents');
    container.gw.writeFile('.codeforge/intents/auth.md', '# Auth Intent');
    container.gw.mkdir('.codeforge/tasks/auth');
    container.gw.writeFile(
      '.codeforge/tasks/auth/TASK-001.json',
      JSON.stringify({ id: 'TASK-001', title: 'Setup auth schema', dependencies: [] }),
    );

    const { lastFrame, stdin, unmount } = renderWithProviders(
      <App container={container} initialTab="tasks" />,
      { container },
    );

    try {
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Tasks');
        expect(frame).toContain('TASK-001');
      });

      // 1. Cancellation test: press 'd', then 'n'
      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Task');
      });

      stdin.write('n');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).not.toContain('Delete Task');
        expect(frame).not.toContain("Task 'TASK-001' deleted");
      });

      // 2. Success test: press 'd', then 'y'
      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Task');
      });

      stdin.write('y');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain("Task 'TASK-001' deleted.");
        expect(frame).toContain('[v]');
      });

      // 3. Tab switch clears stale feedback
      stdin.write('2'); // Switch to Intents tab
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Intents');
        expect(frame).not.toContain("Task 'TASK-001' deleted.");
      });
    } finally {
      unmount();
    }
  });

  it('displays deletion failures on shared StatusBar with error presentation for tasks', async () => {
    const mockDeleteTask = {
      execute: vi.fn().mockImplementation(() => {
        throw new Error('Task locked by scheduler');
      }),
    };

    const container = createInitializedContainer({
      deleteTaskUseCase: mockDeleteTask as any,
    });
    container.gw.mkdir('.codeforge/intents');
    container.gw.writeFile('.codeforge/intents/auth.md', '# Auth Intent');
    container.gw.mkdir('.codeforge/tasks/auth');
    container.gw.writeFile(
      '.codeforge/tasks/auth/TASK-001.json',
      JSON.stringify({ id: 'TASK-001', title: 'Setup auth schema', dependencies: [] }),
    );

    const { lastFrame, stdin, unmount } = renderWithProviders(
      <App container={container} initialTab="tasks" />,
      { container },
    );

    try {
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('TASK-001');
      });

      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Task');
      });

      stdin.write('y');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain("[x] Failed to delete task 'TASK-001': Task locked by scheduler");
      });
    } finally {
      unmount();
    }
  });

  it('displays deletion feedback on shared StatusBar for docs, supports cancellation, and clears on tab switch', async () => {
    const container = createInitializedContainer();
    container.gw.mkdir('.codeforge/docs');
    container.gw.writeFile(
      '.codeforge/docs/manifest.json',
      JSON.stringify({
        version: '1.0',
        documents: {
          architecture: {
            path: '.codeforge/docs/architecture.md',
            intents: ['auth'],
            createdAt: '2026-09-01',
            updatedAt: '2026-09-01',
          },
        },
      }),
    );
    container.gw.writeFile('.codeforge/docs/architecture.md', '# Architecture Document');

    const { lastFrame, stdin, unmount } = renderWithProviders(
      <App container={container} initialTab="docs" />,
      { container },
    );

    try {
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Docs');
        expect(frame).toContain('architecture');
      });

      // 1. Cancellation test: press 'd', then 'n'
      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Document');
      });

      stdin.write('n');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).not.toContain('Delete Document');
        expect(frame).not.toContain("Document 'architecture' deleted");
      });

      // 2. Success test: press 'd', then 'y'
      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Document');
      });

      stdin.write('y');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain("Document 'architecture' deleted successfully.");
        expect(frame).toContain('[v]');
      });

      // 3. Tab switch clears stale feedback
      stdin.write('2'); // Switch to Intents tab
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Intents');
        expect(frame).not.toContain("Document 'architecture' deleted successfully.");
      });
    } finally {
      unmount();
    }
  });

  it('displays deletion failures on shared StatusBar with error presentation for docs', async () => {
    const mockDeleteDoc = {
      execute: vi.fn().mockImplementation(() => {
        throw new Error('Permission denied on doc file');
      }),
    };

    const container = createInitializedContainer({
      deleteDocUseCase: mockDeleteDoc as any,
    });
    container.gw.mkdir('.codeforge/docs');
    container.gw.writeFile(
      '.codeforge/docs/manifest.json',
      JSON.stringify({
        version: '1.0',
        documents: {
          architecture: {
            path: '.codeforge/docs/architecture.md',
            intents: ['auth'],
            createdAt: '2026-09-01',
            updatedAt: '2026-09-01',
          },
        },
      }),
    );
    container.gw.writeFile('.codeforge/docs/architecture.md', '# Architecture Document');

    const { lastFrame, stdin, unmount } = renderWithProviders(
      <App container={container} initialTab="docs" />,
      { container },
    );

    try {
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('architecture');
      });

      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Document');
      });

      stdin.write('y');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain("[x] Failed to delete document 'architecture': Permission denied on doc file");
      });
    } finally {
      unmount();
    }
  });

  it('replaces previous status notification when a new action produces feedback', async () => {
    const container = createInitializedContainer();
    container.gw.mkdir('.codeforge/intents');
    container.gw.writeFile('.codeforge/intents/first-intent.md', '# First Intent');
    container.gw.writeFile('.codeforge/intents/second-intent.md', '# Second Intent');

    const { lastFrame, stdin, unmount } = renderWithProviders(
      <App container={container} initialTab="intents" />,
      { container },
    );

    try {
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('first-intent');
      });

      // Delete first intent
      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Intent');
      });
      stdin.write('y');

      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain("Intent 'first-intent' deleted successfully.");
      });

      // Delete second intent
      stdin.write('d');
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain('Delete Intent');
      });
      stdin.write('y');

      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain("Intent 'second-intent' deleted successfully.");
        expect(frame).not.toContain("Intent 'first-intent' deleted successfully.");
      });
    } finally {
      unmount();
    }
  });
});

describe('App - Configuration language integration', () => {
  it('uses an explicit language prop over saved config and reacts when the prop changes', async () => {
    const container = createInitializedContainer();
    container.gw.mkdir('.codeforge/intents');
    container.gw.writeFile('.codeforge/intents/auth.md', '# Auth Intent');
    container.gw.mkdir('.codeforge/tasks/auth');
    container.gw.writeFile(
      '.codeforge/tasks/auth/TASK-001.json',
      JSON.stringify({ id: 'TASK-001', title: 'Setup auth schema', dependencies: [] }),
    );
    const app = (language: 'en' | 'pt') => (
      <App container={container} initialTab="tasks" language={language} />
    );
    const { lastFrame, rerender, stdin, unmount } = renderWithProviders(app('pt'), { container });

    try {
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('[q] Sair');
        expect(frame).toContain('[3] Tarefas');
        expect(frame).toContain('TASK-001');
      });
      expect(container.configService.loadConfig()?.language).toBe('en');

      // App language overrides disk config for screen content and its modal too.
      stdin.write('2');
      await vi.waitFor(() => expect(lastFrame() ?? '').toContain('[2] Intents'));
      stdin.write('d');
      await vi.waitFor(() => expect(lastFrame() ?? '').toContain('Excluir Intenção'));

      rerender(app('en'));
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Delete Intent');
        expect(frame).toContain('[q] Quit');
      });
      expect(lastFrame() ?? '').not.toContain('Excluir Intenção');
    } finally {
      unmount();
    }
  });

  it('saves language from Config, updates translated UI immediately, and reloads external edits on re-entry', async () => {
    const container = createInitializedContainer();
    container.gw.mkdir('.codeforge/intents');
    container.gw.writeFile('.codeforge/intents/auth.md', '# Auth Intent');

    const { lastFrame, stdin, unmount } = renderWithProviders(
      <App container={container} initialTab="intents" />,
      { container },
    );

    try {
      await vi.waitFor(() => expect(lastFrame() ?? '').toContain('Intents'));

      stdin.write('5');
      // Edit before the Config tab's hydration effects run after navigation.
      stdin.write(' ');
      await vi.waitFor(() => expect(lastFrame() ?? '').toContain('CodeForge Configuration Editor'));

      // The immediate edit should remain visible and saveable.
      expect(lastFrame() ?? '').toContain('Unsaved Changes');
      await vi.waitFor(() => expect(lastFrame() ?? '').toContain('● [pt]'));
      stdin.write('s');
      await vi.waitFor(() => expect(lastFrame() ?? '').toContain('Configuração salva'));

      expect(container.configService.loadConfig()?.language).toBe('pt');

      // The active App instance applies the saved language to the tab bar.
      stdin.write('2');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('[2] Intents');
        expect(frame).toContain('auth');
        expect(frame).not.toContain('CodeForge Configuration Editor');
      });
      stdin.write('d');
      await vi.waitFor(() => expect(lastFrame() ?? '').toContain('Excluir Intenção'));
      stdin.write('n');
      await vi.waitFor(() => expect(lastFrame() ?? '').not.toContain('Excluir Intenção'));

      // Simulate another process changing config.yaml while Config is inactive.
      container.gw.writeFile(
        '.codeforge/config.yaml',
        [
          'version: "1.0"',
          'environment: local',
          'plannerAgent: default',
          'executorAgent: default',
          'language: es',
        ].join('\n'),
      );
      stdin.write('5');
      await vi.waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('CodeForge Configuration Editor');
        expect(frame).toContain('[5] Config');
        expect(frame).toContain('● [es]');
        expect(frame).not.toContain('● [pt]');
      });
    } finally {
      unmount();
    }
  });
});
