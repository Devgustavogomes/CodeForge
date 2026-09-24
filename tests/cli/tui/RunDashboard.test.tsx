import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RunDashboard } from '../../../src/cli/tui/components/run/RunDashboard.js';
import { createAppContainer } from '../../../src/infrastructure/container.js';
import { ExecutionStateRepository } from '../../../src/infrastructure/repositories/ExecutionStateRepository.js';
import { InMemoryWorkspaceGateway } from '../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../helpers/in-memory-agent-runner.js';
import { renderWithProviders, flushAsync } from './helpers/renderWithProviders.js';

function createContainerWithExecution() {
  const gw = new InMemoryWorkspaceGateway();
  const runner = new InMemoryAgentRunner();
  const executionStateRepository = new ExecutionStateRepository(gw);
  const container = createAppContainer(gw, {
    runnerProvider: () => runner,
    executionStateRepository,
  });

  gw.writeFile('.codeforge/tasks/core-engine/TASK-001.json', JSON.stringify({
    id: 'TASK-001', title: 'Initialize repository', dependencies: [],
    objective: 'Set up base workspace configuration', files: ['package.json'],
  }));
  gw.writeFile('.codeforge/tasks/core-engine/TASK-002.json', JSON.stringify({
    id: 'TASK-002', title: 'Implement core business logic', dependencies: ['TASK-001'],
    objective: 'Core business logic implementation', files: ['src/index.ts'],
  }));
  executionStateRepository.save({
    intentId: 'core-engine', status: 'running', startedAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
    tasks: {
      'TASK-001': { status: 'completed', dependencies: [], title: 'Initialize repository', completedAt: '2026-09-06T10:00:05.000Z' },
      'TASK-002': { status: 'running', dependencies: ['TASK-001'], title: 'Implement core business logic', startedAt: '2026-09-06T10:00:05.000Z' },
    },
  });

  return { container, runner, executionStateRepository };
}

describe('RunDashboard - Integration with ExecutionProvider', () => {

  it('completes the selected task when c is pressed', async () => {
    const { container, executionStateRepository } = createContainerWithExecution();
    const { lastFrame, stdin } = renderWithProviders(<RunDashboard isInteractive />, {
      container,
      initialIntent: 'core-engine',
    });

    stdin.write('j');
    await flushAsync(50);
    expect(lastFrame() ?? '').toContain('TASK-002 │ Implement core business logic');

    stdin.write('c');
    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('Task TASK-002 marked as completed');
    });
    expect(executionStateRepository.load('core-engine')?.tasks['TASK-002']?.status)
      .toBe('completed');
  });

  it('renders HooksPanel in idle state by default when configured', () => {
    const { container } = createContainerWithExecution();
    const { lastFrame } = renderWithProviders(
      <RunDashboard isInteractive hasConfiguredHooks={true} />,
      {
        container,
        initialIntent: 'core-engine',
      },
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Lifecycle Hooks');
    expect(frame).toContain('Idle (Waiting for lifecycle events)');
  });

  it('renders HooksPanel in unconfigured state when hasConfiguredHooks is false', () => {
    const { container } = createContainerWithExecution();
    const { lastFrame } = renderWithProviders(
      <RunDashboard isInteractive hasConfiguredHooks={false} />,
      {
        container,
        initialIntent: 'core-engine',
      },
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Lifecycle Hooks');
    expect(frame).toContain('No hooks configured in config.yaml');
  });

  it('forwards activeHook to layout and renders active hook details', () => {
    const { container } = createContainerWithExecution();
    const activeHook = {
      name: 'pre-check',
      event: 'task.verify' as const,
      command: 'npm run test:lint',
      type: 'gate' as const,
      startedAt: Date.now() - 2500,
    };

    const { lastFrame } = renderWithProviders(
      <RunDashboard isInteractive activeHook={activeHook} />,
      {
        container,
        initialIntent: 'core-engine',
      },
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Lifecycle Hooks (Active: 1)');
    expect(frame).toContain('[task.verify]');
    expect(frame).toContain('pre-check');
    expect(frame).toContain('[GATE]');
    expect(frame).toContain('npm run test:lint');
  });

  it('forwards hookHistory to layout and renders recent history', () => {
    const { container } = createContainerWithExecution();
    const hookHistory = [
      {
        id: 'h-1',
        name: 'notify-slack',
        event: 'task.started' as const,
        command: 'curl slack',
        type: 'notify' as const,
        ok: true,
        exitCode: 0,
        durationMs: 400,
        timestamp: new Date().toISOString(),
      },
    ];

    const { lastFrame } = renderWithProviders(
      <RunDashboard isInteractive hookHistory={hookHistory} hasConfiguredHooks={true} />,
      {
        container,
        initialIntent: 'core-engine',
      },
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Recent:');
    expect(frame).toContain('notify-slack');
    expect(frame).toContain('(0.4s)');
  });

  it('allows pressing s or v after selecting an intent from IntentPicker', async () => {
    const { container, executionStateRepository } = createContainerWithExecution();
    container.gw.writeFile('.codeforge/intents/core-engine.md', '# Core Engine\nImplement core engine');
    executionStateRepository.save({
      intentId: 'core-engine', status: 'completed', startedAt: '2026-09-06T10:00:00.000Z',
      completedAt: '2026-09-06T10:00:05.000Z',
      updatedAt: '2026-09-06T10:00:05.000Z',
      tasks: {
        'TASK-001': { status: 'completed', dependencies: [], title: 'Initialize repository', completedAt: '2026-09-06T10:00:05.000Z' },
        'TASK-002': { status: 'completed', dependencies: ['TASK-001'], title: 'Implement core business logic', completedAt: '2026-09-06T10:00:05.000Z' },
      },
    });

    const { lastFrame, stdin } = renderWithProviders(
      <RunDashboard isInteractive />,
      { container },
    );

    expect(lastFrame() ?? '').toContain('Select an Intent');

    // Select the intent
    stdin.write('\r');
    await flushAsync(50);

    expect(lastFrame() ?? '').toContain('[s] Intents');

    // Now press 's' to choose another intent
    stdin.write('s');
    await flushAsync(50);

    expect(lastFrame() ?? '').toContain('Select an Intent');

    // Re-select the intent
    stdin.write('\r');
    await flushAsync(50);
    expect(lastFrame() ?? '').toContain('[v] Review');

    // Now press 'v' to trigger review
    stdin.write('v');
    await flushAsync(120);
    // When review starts, effectiveStatus becomes 'reviewing' or displays review feedback
    expect(lastFrame() ?? '').toMatch(/AI Review|reviewing/i);
  });
});

