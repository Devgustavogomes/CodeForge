import React from 'react';
import { describe, it, expect } from 'vitest';
import { RunDashboard } from '../../../src/cli/tui/components/run/RunDashboard.js';
import { TaskItem } from '../../../src/cli/tui/context/ExecutionContext.js';
import { renderWithProviders, createMockContainer } from './helpers/renderWithProviders.js';

describe('RunDashboard - Smoke Tests do Painel de Execução', () => {
  const mockTasks: TaskItem[] = [
    {
      id: 'TASK-001',
      title: 'Initialize repository',
      status: 'completed',
      dependencies: [],
      objective: 'Set up base workspace configuration',
      files: ['package.json'],
      startedAt: '2026-09-06T10:00:00.000Z',
      completedAt: '2026-09-06T10:00:05.000Z',
    },
    {
      id: 'TASK-002',
      title: 'Implement core business logic',
      status: 'running',
      dependencies: ['TASK-001'],
      objective: 'Core business logic implementation',
      files: ['src/index.ts'],
      startedAt: '2026-09-06T10:00:05.000Z',
    },
  ];

  it('renderiza o estado vazio/inicial quando não há tarefas ativas', () => {
    const container = createMockContainer();
    const { lastFrame } = renderWithProviders(
      <RunDashboard tasks={[]} isInteractive={false} />,
      { container },
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Welcome to CodeForge');
    expect(output).toContain('No specifications found');
    expect(output).toContain('[c] Create new spec');
  });

  it('renderiza a lista de tarefas ativas e painel de métricas', () => {
    const { lastFrame } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={mockTasks}
        selectedTaskId="TASK-002"
        selectedTask={mockTasks[1]}
        specName="core-engine"
        schedulerStatus="running"
        isInteractive={false}
      />,
    );
    const output = lastFrame() ?? '';

    // Painel de métricas e status de execução
    expect(output).toContain('Running [core-engine]');
    expect(output).toContain('Completed: 1');
    expect(output).toContain('Parallel: 1');

    // Lista de tarefas e detalhes da tarefa selecionada
    expect(output).toContain('Tasks (2)');
    expect(output).toContain('TASK-001');
    expect(output).toContain('TASK-002');
    expect(output).toContain('Core business logic implementation');
  });

  it('renderiza painel de logs com saída formatada', () => {
    const { lastFrame } = renderWithProviders(
      <RunDashboard
        breakpoint="wide"
        tasks={mockTasks}
        selectedTaskId="TASK-001"
        selectedTask={mockTasks[0]}
        logs={{
          'TASK-001': [
            '[build] Compiling source files...',
            '[build] Done in 1.2s',
          ],
        }}
        isInteractive={false}
      />,
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Logs: TASK-001');
    expect(output).toContain('[build] Compiling source files...');
    expect(output).toContain('[build] Done in 1.2s');
  });
});
