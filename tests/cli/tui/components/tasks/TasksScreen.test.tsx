import React from 'react';
import { describe, it, expect, vi } from 'vitest';
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

  it('abre o ViewTaskModal ao pressionar Enter sobre uma tarefa selecionada e fecha com Esc', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        isInteractive={true}
      />,
    );

    expect(lastFrame()).toContain('Task: TASK-001');

    // Pressionar Enter para abrir o modal de detalhes da tarefa
    stdin.write('\r');
    await flushAsync();

    let output = lastFrame() ?? '';
    // Valida abertura do ViewTaskModal e exibição detalhada da tarefa
    expect(output).toContain('TASK-001: Setup core entities');
    expect(output).toContain('[COMPLETED]');
    expect(output).toContain('Spec: test-spec');
    expect(output).toContain('[Esc / q] Fechar');
    expect(output).toContain('Define interfaces and domain entities');
    expect(output).toContain('[↑/↓ ou j/k] Rolar');

    // Rola até o fim para verificar os arquivos declarados
    stdin.write('G');
    await flushAsync();
    expect(lastFrame()).toContain('src/domain/entity.ts');

    // Pressionar Esc para fechar o modal
    stdin.write('\u001B');
    await flushAsync(100);

    output = lastFrame() ?? '';
    // Retorna para a visualização da árvore de tarefas
    expect(output).toContain('Tasks (2)');
    expect(output).toContain('Task: TASK-001');
    expect(output).not.toContain('[Esc / q] Fechar');
  });

  it('navega até outra tarefa, abre com Enter, fecha com q e preserva a seleção', async () => {
    const onCompleteTask = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        onCompleteTask={onCompleteTask}
        isInteractive={true}
      />,
    );

    // Navega para TASK-002
    stdin.write('\u001B[B');
    await flushAsync();
    expect(lastFrame()).toContain('Task: TASK-002');

    // Abre ViewTaskModal com Enter
    stdin.write('\r');
    await flushAsync();

    let output = lastFrame() ?? '';
    expect(output).toContain('TASK-002: Implement use cases');
    expect(output).toContain('[FAILED]');
    expect(output).toContain('Business logic execution');
    expect(output).toContain('[Esc / q] Fechar');

    // Pula para o final com 'G' para inspecionar os erros da tarefa
    stdin.write('G');
    await flushAsync();
    expect(lastFrame()).toContain('ReferenceError: entity is undefined');

    // Enquanto o modal estiver aberto, atalhos da tela (ex: 'c' para completar) ficam inativos
    stdin.write('c');
    await flushAsync();
    expect(onCompleteTask).not.toHaveBeenCalled();

    // Fecha com 'q'
    stdin.write('q');
    await flushAsync();

    output = lastFrame() ?? '';
    // Modal fechou e a seleção de TASK-002 foi preservada
    expect(output).toContain('Tasks (2)');
    expect(output).toContain('Task: TASK-002');
    expect(output).toContain('Business logic execution');
    expect(output).not.toContain('[Esc / q] Fechar');
  });

  it('não abre o modal com Enter se o usuário estiver em modo de busca de spec', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        isInteractive={true}
      />,
    );

    // Inicia busca de spec com '/'
    stdin.write('/');
    await flushAsync();
    expect(lastFrame()).toContain('Search:');

    // Pressiona Enter na busca (deve apenas confirmar/encerrar a busca, sem abrir ViewTaskModal)
    stdin.write('\r');
    await flushAsync();

    const output = lastFrame() ?? '';
    expect(output).not.toContain('[Esc / q] Fechar');
    expect(output).toContain('Tasks (2)');
  });
});