import React from 'react';
import { describe, expect, it } from 'vitest';
import { RunDashboard } from '../../../src/cli/tui/components/run/RunDashboard.js';
import { createAppContainer } from '../../../src/infrastructure/container.js';
import { ExecutionStateRepository } from '../../../src/infrastructure/repositories/ExecutionStateRepository.js';
import { InMemoryWorkspaceGateway } from '../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../helpers/in-memory-agent-runner.js';
import { renderWithProviders, flushAsync } from './helpers/renderWithProviders.js';

function criarContainerComExecucao() {
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
    specId: 'core-engine', status: 'running', startedAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
    tasks: {
      'TASK-001': { status: 'completed', dependencies: [], title: 'Initialize repository', completedAt: '2026-09-06T10:00:05.000Z' },
      'TASK-002': { status: 'running', dependencies: ['TASK-001'], title: 'Implement core business logic', startedAt: '2026-09-06T10:00:05.000Z' },
    },
  });

  return { container, runner, executionStateRepository };
}

describe('RunDashboard - integração com ExecutionProvider', () => {
  it('renderiza o SpecPicker quando não há spec ativa', () => {
    const { lastFrame } = renderWithProviders(<RunDashboard isInteractive={false} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('⚒ CodeForge');
    expect(output).toContain('No specifications found');
    expect(output).toContain('[c] Create');
    expect(output).toContain('[p] Pull');
  });

  it('obtém métricas, tarefas e barra contextual do provider', () => {
    const { container } = criarContainerComExecucao();
    const { lastFrame } = renderWithProviders(<RunDashboard isInteractive={false} />, {
      container,
      initialSpec: 'core-engine',
    });
    const output = lastFrame() ?? '';

    expect(output).toContain('Running [core-engine]');
    expect(output).toContain('Completed: 1');
    expect(output).toContain('Parallel: 1');
    expect(output).toContain('Tasks (2)');
    expect(output).toContain('TASK-001');
    expect(output).toContain('TASK-002');
    expect(output).toContain('[s] Switch Spec');
    expect(output).toContain('[X] Reset All & Run');
  });

  it('exibe os logs do provider após alternar para o painel de logs', async () => {
    const { container, runner } = criarContainerComExecucao();
    const scheduler = container.createTaskScheduler(runner, {
      environment: 'test', plannerAgent: 'mock', executorAgent: 'mock', language: 'en',
    });
    const { lastFrame, stdin } = renderWithProviders(<RunDashboard isInteractive />, {
      container,
      scheduler,
      initialSpec: 'core-engine',
      flushIntervalMs: 0,
    });

    await flushAsync(50);
    scheduler.getReporter()?.onLog?.('TASK-001', '[build] Compiling source files...');
    scheduler.getReporter()?.onLog?.('TASK-001', '[build] Done in 1.2s');
    stdin.write('\t');
    await flushAsync(50);

    const output = lastFrame() ?? '';
    expect(output).toContain('Logs: TASK-001');
    expect(output).toContain('[build] Compiling source files...');
    expect(output).toContain('[Esc] Back to Tasks');
  });
  it('completes the selected task when c is pressed', async () => {
    const { container, executionStateRepository } = criarContainerComExecucao();
    const { lastFrame, stdin } = renderWithProviders(<RunDashboard isInteractive />, {
      container,
      initialSpec: 'core-engine',
    });

    stdin.write('j');
    await flushAsync(50);
    expect(lastFrame() ?? '').toContain('TASK-002 │ Implement core business logic');

    stdin.write('c');
    await flushAsync(50);

    expect(lastFrame() ?? '').toContain('Task TASK-002 marked as completed');
    expect(executionStateRepository.load('core-engine')?.tasks['TASK-002']?.status)
      .toBe('completed');
  });
});
