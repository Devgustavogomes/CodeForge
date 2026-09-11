import React from 'react';
import { describe, it, expect } from 'vitest';
import {
  TasksScreen,
  TaskScreenItem,
} from '../../../../../src/cli/tui/components/tasks/TasksScreen.js';
import { renderWithProviders, flushAsync } from '../../helpers/renderWithProviders.js';

describe('TasksScreen - Smoke Tests da Tela de Gerenciamento de Tarefas', () => {
  const mockTasks: TaskScreenItem[] = [
    {
      id: 'TASK-001',
      title: 'Setup core entities',
      status: 'completed',
      dependencies: [],
      objective: 'Define interfaces and domain entities',
      files: ['src/domain/entity.ts'],
      startedAt: '2026-09-06T10:00:00.000Z',
      completedAt: '2026-09-06T10:00:05.000Z',
    },
    {
      id: 'TASK-002',
      title: 'Implement use cases',
      status: 'failed',
      dependencies: ['TASK-001'],
      objective: 'Business logic execution',
      files: ['src/application/use-case.ts'],
      startedAt: '2026-09-06T10:00:05.000Z',
      completedAt: '2026-09-06T10:00:15.000Z',
      errors: ['ReferenceError: entity is undefined'],
      constraints: ['TypeScript only'],
      acceptanceCriteria: ['Pass unit tests'],
    },
  ];

  it('renderiza a árvore de tarefas com status e duração', () => {
    const { lastFrame } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        isInteractive={false}
      />,
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Tasks (2)');
    expect(output).toContain('TASK-001');
    expect(output).toContain('[COMPLETED]');
    expect(output).toContain('TASK-002');
    expect(output).toContain('[FAILED]');
    expect(output).toContain('Task: TASK-001');
    expect(output).toContain('Define interfaces and domain entities');
    expect(output).toContain('src/domain/entity.ts');
  });

  it('navega entre tarefas via teclado (setas para cima/baixo), atualizando a seleção', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        isInteractive={true}
      />,
    );

    expect(lastFrame()).toContain('Task: TASK-001');

    // Seta para baixo -> seleciona TASK-002
    stdin.write('\u001B[B');
    await flushAsync();
    expect(lastFrame()).toContain('Task: TASK-002');
    expect(lastFrame()).toContain('Business logic execution');

    // Seta para cima -> retorna para TASK-001
    stdin.write('\u001B[A');
    await flushAsync();
    expect(lastFrame()).toContain('Task: TASK-001');
    expect(lastFrame()).toContain('Define interfaces and domain entities');
  });
});