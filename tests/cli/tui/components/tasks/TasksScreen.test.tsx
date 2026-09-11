import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  TasksScreen,
  TaskScreenItem,
} from '../../../../../src/cli/tui/components/tasks/TasksScreen.js';
import { TaskTree } from '../../../../../src/cli/tui/components/tasks/components/TaskTree.js';
import { TaskMetadataView } from '../../../../../src/cli/tui/components/tasks/components/TaskMetadataView.js';
import { renderWithProviders, createMockContainer } from '../../helpers/renderWithProviders.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TasksScreen - Tela de Gerenciamento de Tarefas (BDD)', () => {
  const mockTasks: TaskScreenItem[] = [
    {
      id: 'TASK-001',
      title: 'Setup core entities',
      status: 'completed',
      dependencies: [],
      objective: 'Define interfaces and domain entities',
      files: ['src/domain/entity.ts'],
    },
    {
      id: 'TASK-002',
      title: 'Implement use cases',
      status: 'failed',
      dependencies: ['TASK-001'],
      objective: 'Business logic execution',
      files: ['src/application/use-case.ts'],
      errors: ['ReferenceError: entity is undefined'],
      constraints: ['TypeScript only'],
      acceptanceCriteria: ['Pass unit tests'],
    },
  ];

  describe('Renderização e Exibição de Tarefas', () => {
    it('ao carregar tarefas de uma spec, exibe lista com status e detalhes da tarefa ativa', () => {
      const { lastFrame } = renderWithProviders(
        <TasksScreen
          initialSpec="test-spec"
          initialTasks={mockTasks}
          isInteractive={false}
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Tasks (2)');
      expect(output).toContain('TASK-001');
      expect(output).toContain('[COMPLETED]');
      expect(output).toContain('TASK-002');
      expect(output).toContain('Task: TASK-001');
      expect(output).toContain('Define interfaces and domain entities');
      expect(output).toContain('src/domain/entity.ts');
    });

    it('renderiza TaskTree com alinhamento visual e ponteiro de seleção', () => {
      const { lastFrame } = renderWithProviders(
        <TaskTree
          tasks={mockTasks}
          visibleTasks={mockTasks}
          selectedTaskId="TASK-001"
          specs={['test-spec']}
          selectedSpecIndex={0}
          currentSpec="test-spec"
          isSideBySide={true}
        />
      );
      const output = lastFrame() ?? '';
      expect(output).toContain('Tasks (2)');
      expect(output).toContain('TASK-001');
      expect(output).toContain('TASK-002');
      expect(output).toContain('▌');
    });
  });

  describe('Ciclo de Ações do Usuário (Conclusão e Reset)', () => {
    it('ao pressionar "c", completa a tarefa; ao pressionar "x", reseta para pendente; e ignora "r"', async () => {
      const onCompleteTask = vi.fn();
      const onResetTask = vi.fn();

      const { stdin } = renderWithProviders(
        <TasksScreen
          initialSpec="test-spec"
          initialTasks={mockTasks}
          onCompleteTask={onCompleteTask}
          onResetTask={onResetTask}
          isInteractive={true}
        />
      );

      // Initial task is TASK-001. Press 'c' to complete
      stdin.write('c');
      await tick();
      expect(onCompleteTask).toHaveBeenCalledWith('TASK-001');

      // Press 'r' (should NOT do anything in tasks tab)
      stdin.write('r');
      await tick();

      // Press 'x' to reset
      stdin.write('x');
      await tick();
      expect(onResetTask).toHaveBeenCalledWith('TASK-001');
    });

    it('persiste ações de conclusão e reset no repositório de estado em disco', async () => {
      const container = createMockContainer();
      const gw = container.workspaceGateway;
      gw.mkdir('.codeforge');
      gw.mkdir('.codeforge/specs');
      gw.mkdir('.codeforge/executions');
      gw.mkdir('.codeforge/tasks/test-spec');

      const taskDef = {
        id: 'TASK-001',
        title: 'Persisted Task',
        objective: 'Check persistence',
        dependencies: [],
        files: [],
        constraints: [],
        acceptanceCriteria: [],
      };
      gw.writeFile(
        '.codeforge/tasks/test-spec/TASK-001.json',
        JSON.stringify(taskDef),
      );

      const { stdin, lastFrame } = renderWithProviders(
        <TasksScreen
          container={container}
          initialSpec="test-spec"
          isInteractive={true}
        />,
        { container, initialSpec: 'test-spec' },
      );

      await tick();

      expect(lastFrame() ?? '').toContain('TASK-001');

      // Press 'c' to mark complete
      stdin.write('c');
      await tick();

      const stateAfterComplete = container.executionStateRepository.load('test-spec');
      expect(stateAfterComplete).not.toBeNull();
      expect(stateAfterComplete?.tasks['TASK-001']?.status).toBe('completed');
      expect(lastFrame() ?? '').toContain('marked as completed');

      // Press 'x' to reset
      stdin.write('x');
      await tick();

      const stateAfterReset = container.executionStateRepository.load('test-spec');
      expect(stateAfterReset?.tasks['TASK-001']?.status).toBe('pending');
      expect(lastFrame() ?? '').toContain('reset to pending');
    });
  });

  describe('Busca e Alternância de Especificações', () => {
    it('ao pressionar "/", ativa a barra de busca e filtra interativamente', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <TasksScreen
          initialSpec="test-spec"
          initialTasks={mockTasks}
          isInteractive={true}
        />
      );

      stdin.write('/');
      await tick();

      let output = lastFrame() ?? '';
      expect(output).toContain('Search:');

      stdin.write('test');
      await tick();

      output = lastFrame() ?? '';
      expect(output).toContain('test█');

      stdin.write('\r');
      await tick();

      output = lastFrame() ?? '';
      expect(output).not.toContain('Search:');
    });
  });

  describe('Modos de Visualização e Inspeção Detalhada', () => {
    it('ao pressionar "v", alterna entre a visualização formatada e JSON bruto', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <TasksScreen
          initialSpec="test-spec"
          initialTasks={mockTasks}
          isInteractive={true}
        />
      );

      stdin.write('v');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('"id": "TASK-001"');
      expect(output).toContain('Formatted');
    });

    it('TaskMetadataView renderiza compacto por padrão e revela constraints/aceite quando expandido', () => {
      const { lastFrame } = renderWithProviders(
        <TaskMetadataView
          selectedTask={mockTasks[1]}
          viewJson={false}
          isExpanded={false}
          feedback={{ type: 'error', message: 'Something failed' }}
          isSideBySide={true}
        />
      );
      let output = lastFrame() ?? '';
      expect(output).toContain('Task: TASK-002');
      expect(output).toContain('Business logic execution');
      expect(output).toContain('TASK-001');
      expect(output).not.toContain('TypeScript only');
      expect(output).not.toContain('Pass unit tests');
      expect(output).toContain('ReferenceError: entity is undefined');
      expect(output).toContain('Something failed');
      expect(output).toContain('[e] Expand');

      const expandedRender = renderWithProviders(
        <TaskMetadataView
          selectedTask={mockTasks[1]}
          viewJson={false}
          isExpanded={true}
          feedback={null}
          isSideBySide={true}
        />
      );
      output = expandedRender.lastFrame() ?? '';
      expect(output).toContain('Constraints:');
      expect(output).toContain('TypeScript only');
      expect(output).toContain('Acceptance:');
      expect(output).toContain('Pass unit tests');
      expect(output).toContain('[e] Collapse');
    });

    it('ao pressionar "e", alterna o modo expandido na tela TasksScreen', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <TasksScreen
          initialSpec="test-spec"
          initialTasks={mockTasks}
          isInteractive={true}
        />
      );

      stdin.write('j');
      await tick();

      let output = lastFrame() ?? '';
      expect(output).not.toContain('TypeScript only');

      stdin.write('e');
      await tick();

      output = lastFrame() ?? '';
      expect(output).toContain('TypeScript only');
      expect(output).toContain('Pass unit tests');

      stdin.write('e');
      await tick();

      output = lastFrame() ?? '';
      expect(output).not.toContain('TypeScript only');
    });
  });
});