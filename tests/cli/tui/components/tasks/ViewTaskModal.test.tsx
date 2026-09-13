import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ViewTaskModal } from '../../../../../src/cli/tui/components/tasks/ViewTaskModal.js';
import { TaskScreenItem } from '../../../../../src/cli/tui/components/tasks/components/TaskTree.js';
import { formatTaskToMarkdown } from '../../../../../src/cli/tui/components/tasks/utils/taskFormatter.js';
import { renderWithProviders, flushAsync } from '../../helpers/renderWithProviders.js';

describe('ViewTaskModal component and taskFormatter', () => {
  const mockTask: TaskScreenItem = {
    id: 'TASK-002',
    title: 'Implementar ViewTaskModal',
    status: 'pending',
    dependencies: ['TASK-001'],
    startedAt: '2026-09-12T10:00:00.000Z',
    objective: 'Criar modal com visualizacao de task linha a linha',
    files: ['src/cli/tui/components/tasks/ViewTaskModal.tsx'],
    context: 'Instrucoes de contexto tecnico',
    acceptanceCriteria: ['Renderiza todos os campos', 'Suporta rolagem'],
    constraints: ['RNF01: useTerminalDimensions', 'RNF03: useMemo'],
    errors: ['Falha previa de execucao'],
  };

  describe('formatTaskToMarkdown', () => {
    it('formats a complete task with all sections into markdown', () => {
      const md = formatTaskToMarkdown(mockTask, 'test-spec');

      expect(md).toContain('# [TASK-002] Implementar ViewTaskModal');
      expect(md).toContain('> Spec: test-spec');
      expect(md).toContain('## Status ([PENDING])');
      expect(md).toContain('## Objective');
      expect(md).toContain('Criar modal com visualizacao de task linha a linha');
      expect(md).toContain('## Dependencies');
      expect(md).toContain('- TASK-001');
      expect(md).toContain('## Files');
      expect(md).toContain('- src/cli/tui/components/tasks/ViewTaskModal.tsx');
      expect(md).toContain('## Context');
      expect(md).toContain('Instrucoes de contexto tecnico');
      expect(md).toContain('## Acceptance Criteria');
      expect(md).toContain('- Renderiza todos os campos');
      expect(md).toContain('- Suporta rolagem');
      expect(md).toContain('## Constraints');
      expect(md).toContain('- RNF01: useTerminalDimensions');
      expect(md).toContain('- RNF03: useMemo');
      expect(md).toContain('## Errors');
      expect(md).toContain('- Falha previa de execucao');
    });

    it('handles root task without errors or dependencies', () => {
      const rootTask: TaskScreenItem = {
        id: 'TASK-ROOT',
        title: 'Root task',
        status: 'completed',
        dependencies: [],
      };
      const md = formatTaskToMarkdown(rootTask);

      expect(md).toContain('# [TASK-ROOT] Root task');
      expect(md).toContain('## Status ([COMPLETED])');
      expect(md).toContain('None (Root)');
      expect(md).not.toContain('## Errors');
    });
  });

  describe('ViewTaskModal UI and Interactions', () => {

    it('scrolls vertically line by line using j/k and arrow keys', async () => {
      const onClose = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <ViewTaskModal
          task={mockTask}
          isOpen={true}
          onClose={onClose}
          maxVisibleLines={5}
        />,
      );

      expect(lastFrame() ?? '').toContain('Linhas 1-5 de');

      // Scroll down 1 line with 'j'
      stdin.write('j');
      await flushAsync();
      expect(lastFrame() ?? '').toContain('Linhas 2-6 de');

      // Scroll down 1 line with Down Arrow
      stdin.write('\u001B[B');
      await flushAsync();
      expect(lastFrame() ?? '').toContain('Linhas 3-7 de');

      // Scroll up 1 line with 'k'
      stdin.write('k');
      await flushAsync();
      expect(lastFrame() ?? '').toContain('Linhas 2-6 de');

      // Scroll up 1 line with Up Arrow
      stdin.write('\u001B[A');
      await flushAsync();
      expect(lastFrame() ?? '').toContain('Linhas 1-5 de');
      expect(lastFrame() ?? '').toContain('[TOP]');
    });

    it('jumps directly to the bottom with G and top with g', async () => {
      const onClose = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <ViewTaskModal
          task={mockTask}
          isOpen={true}
          onClose={onClose}
          maxVisibleLines={5}
        />,
      );

      // Jump to bottom with 'G'
      stdin.write('G');
      await flushAsync();
      let output = lastFrame() ?? '';
      expect(output).toContain('[BOTTOM]');

      // Jump back to top with 'g'
      stdin.write('g');
      await flushAsync();
      output = lastFrame() ?? '';
      expect(output).toContain('[TOP]');
      expect(output).toContain('Linhas 1-5 de');
    });

    it('scrolls half page up and down using u and d', async () => {
      const onClose = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <ViewTaskModal
          task={mockTask}
          isOpen={true}
          onClose={onClose}
          maxVisibleLines={6} // pageSize = 3
        />,
      );

      expect(lastFrame() ?? '').toContain('Linhas 1-6 de');

      // Scroll half page down with 'd'
      stdin.write('d');
      await flushAsync();
      expect(lastFrame() ?? '').toContain('Linhas 4-9 de');

      // Scroll half page up with 'u'
      stdin.write('u');
      await flushAsync();
      expect(lastFrame() ?? '').toContain('Linhas 1-6 de');
      expect(lastFrame() ?? '').toContain('[TOP]');
    });

    it('toggles between formatted Markdown and raw JSON view using v and J', async () => {
      const onClose = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <ViewTaskModal
          task={mockTask}
          isOpen={true}
          onClose={onClose}
          maxVisibleLines={15}
        />,
      );

      // Initially in Markdown mode
      expect(lastFrame() ?? '').toContain('## Status');

      // Toggle to JSON mode with 'v'
      stdin.write('v');
      await flushAsync();
      let output = lastFrame() ?? '';
      expect(output).toContain('"id": "TASK-002"');
      expect(output).toContain('"title": "Implementar ViewTaskModal"');
      expect(output).not.toContain('## Status');

      // Toggle back to Markdown mode with 'J'
      stdin.write('J');
      await flushAsync();
      output = lastFrame() ?? '';
      expect(output).toContain('## Status');
      expect(output).not.toContain('"id": "TASK-002"');
    });

    it('closes the modal when Esc, q or Q is pressed', async () => {
      const onClose = vi.fn();
      const { stdin } = renderWithProviders(
        <ViewTaskModal
          task={mockTask}
          isOpen={true}
          onClose={onClose}
        />,
      );

      // Press 'q'
      stdin.write('q');
      await flushAsync();
      expect(onClose).toHaveBeenCalledTimes(1);

      // Press 'Q'
      stdin.write('Q');
      await flushAsync();
      expect(onClose).toHaveBeenCalledTimes(2);

      // Press 'Esc'
      stdin.write('\u001B');
      await flushAsync(100);
      expect(onClose).toHaveBeenCalledTimes(3);
    });

    it('returns null and does not render when isOpen is false or task is null', () => {
      const onClose = vi.fn();
      const { lastFrame: frameClosed } = renderWithProviders(
        <ViewTaskModal
          task={mockTask}
          isOpen={false}
          onClose={onClose}
        />,
      );
      expect(frameClosed()).toBe('');

      const { lastFrame: frameNoTask } = renderWithProviders(
        <ViewTaskModal
          task={null}
          isOpen={true}
          onClose={onClose}
        />,
      );
      expect(frameNoTask()).toBe('');
    });
  });
});
