import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  TasksScreen,
  TaskScreenItem,
} from '../../../../../src/cli/tui/components/tasks/TasksScreen.js';
import { renderWithProviders, flushAsync } from '../../helpers/renderWithProviders.js';
import { createInitializedContainer } from '../../helpers/renderWithProviders.js';
import { PATHS } from '../../../../../src/infrastructure/paths.js';
import { AppContainer } from '../../../../../src/infrastructure/container.js';
import { DeleteTaskResult } from '../../../../../src/application/use-cases/DeleteTaskUseCase.js';
import { translate } from '../../../../../src/cli/ui/i18n.js';

const DELETE_INTENT = 'delete-intent';

function createTaskContainer(
  tasks: Array<Pick<TaskScreenItem, 'id' | 'title' | 'dependencies'>>,
): AppContainer {
  const container = createInitializedContainer();
  container.gw.writeFile(PATHS.intentFile(DELETE_INTENT), '# Delete intent');

  for (const task of tasks) {
    container.gw.writeFile(
      PATHS.taskFile(DELETE_INTENT, task.id),
      JSON.stringify({
        ...task,
        objective: `Objective for ${task.id}`,
        context: '',
        implementation: '',
        files: [],
        constraints: [],
        acceptanceCriteria: [],
      }),
    );
  }

  return container;
}

const deletableTasks = [
  { id: 'TASK-001', title: 'Prepare deletion', dependencies: [] },
  {
    id: 'TASK-002',
    title: 'Consume deleted dependency',
    dependencies: ['TASK-001'],
  },
  { id: 'TASK-003', title: 'Finish deletion flow', dependencies: [] },
];

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
        initialIntent="test-intent"
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
        initialIntent="test-intent"
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
    expect(output).toContain('Intent: test-intent');
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
        initialIntent="test-intent"
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

  it('não abre o modal com Enter se o usuário estiver em modo de busca de intent', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        initialIntent="test-intent"
        initialTasks={mockTasks}
        isInteractive={true}
      />,
    );

    // Inicia busca de intent com '/'
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

const normalizeOutput = (value: string): string =>
  value.replace(/[│╭╮╰╯─┌┐└┘]/g, ' ').replace(/\s+/g, ' ');

describe('TasksScreen - task deletion', () => {
  it('opens a localized confirmation for the selected task without deleting it', async () => {
    const container = createTaskContainer(deletableTasks);
    const execute = vi.spyOn(container.deleteTaskUseCase, 'execute');
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen container={container} initialIntent={DELETE_INTENT} />,
      { container, initialIntent: DELETE_INTENT },
    );
    await flushAsync();

    stdin.write('\u001B[B');
    await flushAsync();
    stdin.write('d');
    await flushAsync();

    const output = normalizeOutput(lastFrame() ?? '');
    expect(output).toContain(translate('tui_task_delete_title', 'en'));
    expect(output).toContain('TASK-002');
    expect(output).toContain('Consume deleted dependency');
    expect(output).toContain(translate('tui_task_delete_warning', 'en'));
    expect(execute).not.toHaveBeenCalled();
    expect(container.gw.exists(PATHS.taskFile(DELETE_INTENT, 'TASK-002'))).toBe(true);
  });

  it.each([
    ['n', 'n'],
    ['Escape', '\u001B'],
  ])('cancels with %s without mutating tasks', async (_label, input) => {
    const container = createTaskContainer(deletableTasks);
    const execute = vi.spyOn(container.deleteTaskUseCase, 'execute');
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen container={container} initialIntent={DELETE_INTENT} />,
      { container, initialIntent: DELETE_INTENT },
    );
    await flushAsync();

    stdin.write('d');
    await flushAsync();
    stdin.write(input);
    await flushAsync(100);

    expect(execute).not.toHaveBeenCalled();
    expect(container.gw.exists(PATHS.taskFile(DELETE_INTENT, 'TASK-001'))).toBe(true);
    expect(lastFrame()).toContain('Tasks (3)');
    expect(lastFrame()).not.toContain(translate('tui_task_delete_title', 'en'));
  });

  it.each([
    ['y', 'y'],
    ['Enter', '\r'],
  ])('confirms with %s and invokes DeleteTaskUseCase exactly once', async (_label, input) => {
    const container = createTaskContainer(deletableTasks);
    const execute = vi.spyOn(container.deleteTaskUseCase, 'execute');
    const { stdin } = renderWithProviders(
      <TasksScreen container={container} initialIntent={DELETE_INTENT} />,
      { container, initialIntent: DELETE_INTENT },
    );
    await flushAsync();

    stdin.write('d');
    await flushAsync();
    stdin.write(input);
    await flushAsync();

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(DELETE_INTENT, 'TASK-001');
  });

  it('reloads tasks, cleans sibling dependencies, and publishes cleanup feedback', async () => {
    const container = createTaskContainer(deletableTasks.slice(0, 2));
    const onFeedback = vi.fn();
    const onNotification = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        container={container}
        initialIntent={DELETE_INTENT}
        onFeedback={onFeedback}
        onNotification={onNotification}
      />,
      { container, initialIntent: DELETE_INTENT },
    );
    await flushAsync();

    stdin.write('d');
    await flushAsync();
    stdin.write('y');
    await flushAsync();

    const successMessage = translate('tui_task_delete_success', 'en', {
      taskId: 'TASK-001',
      count: 1,
    });
    const output = normalizeOutput(lastFrame() ?? '');
    expect(output).toContain('Tasks (1)');
    expect(output).toContain('Task: TASK-002');
    expect(output).toContain(successMessage);
    expect(onFeedback).toHaveBeenCalledOnce();
    expect(onFeedback).toHaveBeenCalledWith({
      type: 'success',
      message: successMessage,
    });
    expect(onNotification).toHaveBeenCalledOnce();
    expect(onNotification).toHaveBeenCalledWith(successMessage, 'success');

    const sibling = JSON.parse(
      container.gw.readFile(PATHS.taskFile(DELETE_INTENT, 'TASK-002')),
    ) as { dependencies: string[] };
    expect(sibling.dependencies).toEqual([]);
  });

  it('repairs the selected index after deleting the final list item', async () => {
    const container = createTaskContainer(deletableTasks);
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen container={container} initialIntent={DELETE_INTENT} />,
      { container, initialIntent: DELETE_INTENT },
    );
    await flushAsync();

    stdin.write('\u001B[B');
    await flushAsync();
    stdin.write('\u001B[B');
    await flushAsync();
    expect(lastFrame()).toContain('Task: TASK-003');

    stdin.write('D');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();

    expect(lastFrame()).toContain('Tasks (2)');
    expect(lastFrame()).toContain('Task: TASK-002');
  });

  it('shows a valid empty state after deleting the only task', async () => {
    const container = createTaskContainer([deletableTasks[0]]);
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen container={container} initialIntent={DELETE_INTENT} />,
      { container, initialIntent: DELETE_INTENT },
    );
    await flushAsync();

    stdin.write('d');
    await flushAsync();
    stdin.write('y');
    await flushAsync();

    const output = lastFrame() ?? '';
    expect(output).toContain('Tasks (0)');
    expect(output).toContain('No tasks found for intent');
    expect(output).toContain(DELETE_INTENT);
    expect(output).toContain('Task: None');
  });

  it.each([
    [
      { kind: 'not-initialized' } as DeleteTaskResult,
      translate('tui_delete_not_initialized', 'en'),
    ],
    [
      { kind: 'intent-not-found' } as DeleteTaskResult,
      translate('tui_task_delete_intent_not_found', 'en', { intent: DELETE_INTENT }),
    ],
    [
      { kind: 'task-not-found' } as DeleteTaskResult,
      translate('tui_task_delete_not_found', 'en', {
        taskId: 'TASK-001',
        intent: DELETE_INTENT,
      }),
    ],
  ])('retains the list and reports the %s deletion result', async (result, message) => {
    const container = createTaskContainer(deletableTasks);
    vi.spyOn(container.deleteTaskUseCase, 'execute').mockReturnValue(result);
    const onFeedback = vi.fn();
    const onNotification = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        container={container}
        initialIntent={DELETE_INTENT}
        onFeedback={onFeedback}
        onNotification={onNotification}
      />,
      { container, initialIntent: DELETE_INTENT },
    );
    await flushAsync();

    stdin.write('d');
    await flushAsync();
    stdin.write('y');
    await flushAsync();

    const output = normalizeOutput(lastFrame() ?? '');
    expect(output).toContain('Tasks (3)');
    expect(onFeedback).toHaveBeenCalledWith({ type: 'error', message });
    expect(onNotification).toHaveBeenCalledWith(message, 'error');
  });

  it('retains the list and reports thrown deletion errors', async () => {
    const container = createTaskContainer(deletableTasks);
    vi.spyOn(container.deleteTaskUseCase, 'execute').mockImplementation(() => {
      throw new Error('permission denied');
    });
    const onNotification = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        container={container}
        initialIntent={DELETE_INTENT}
        onNotification={onNotification}
      />,
      { container, initialIntent: DELETE_INTENT },
    );
    await flushAsync();

    stdin.write('d');
    await flushAsync();
    stdin.write('y');
    await flushAsync();

    const expectedError = translate('tui_task_delete_error', 'en', {
      taskId: 'TASK-001',
      error: 'permission denied',
    });
    const output = normalizeOutput(lastFrame() ?? '');
    expect(output).toContain('Tasks (3)');
    expect(onNotification).toHaveBeenCalledWith(expectedError, 'error');
  });

  it('does not open deletion while intent search is active', async () => {
    const container = createTaskContainer(deletableTasks);
    const execute = vi.spyOn(container.deleteTaskUseCase, 'execute');
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen container={container} initialIntent={DELETE_INTENT} />,
      { container, initialIntent: DELETE_INTENT },
    );
    await flushAsync();

    stdin.write('/');
    await flushAsync();
    stdin.write('d');
    await flushAsync();

    const output = lastFrame() ?? '';
    expect(output).toContain('Search:');
    expect(output).not.toContain(translate('tui_task_delete_title', 'en'));
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not dispatch deletion while the task view modal is open', async () => {
    const container = createTaskContainer(deletableTasks);
    const execute = vi.spyOn(container.deleteTaskUseCase, 'execute');
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen container={container} initialIntent={DELETE_INTENT} />,
      { container, initialIntent: DELETE_INTENT },
    );
    await flushAsync();

    stdin.write('\r');
    await flushAsync();
    stdin.write('d');
    await flushAsync();

    expect(lastFrame()).toContain('TASK-001: Prepare deletion');
    expect(lastFrame()).not.toContain(translate('tui_task_delete_title', 'en'));
    expect(execute).not.toHaveBeenCalled();
  });
});
