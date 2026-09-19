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
});
