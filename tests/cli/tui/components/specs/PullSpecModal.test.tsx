import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { PullSpecModal } from '../../../../../src/cli/tui/components/specs/PullSpecModal.js';
import { PullSpecUseCase } from '../../../../../src/application/use-cases/PullSpecUseCase.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PullSpecModal - Fluxo de Obtenção de Especificações (BDD)', () => {
  describe('Ao renderizar o modal', () => {
    it('exibe seletor de provedor, campos de entrada e atalhos de rodapé', () => {
      const { lastFrame } = renderWithProviders(<PullSpecModal isOpen={true} />);
      const output = lastFrame() ?? '';

      expect(output).toContain('Pull Specification');
      expect(output).toContain('1. Source Provider:');
      expect(output).toContain('2. Spec ID / Issue Number / URL:');
      expect(output).toContain('3. Custom Filename (optional):');
      expect(output).toContain('[Enter] Pull');
      expect(output).toContain('[Esc] Cancel');
    });

    it('carrega e destaca o provedor configurado por padrão (filesystem)', async () => {
      const { lastFrame } = renderWithProviders(
        <PullSpecModal isOpen={true} defaultProvider="filesystem" />
      );
      await tick(100);

      const output = lastFrame() ?? '';
      expect(output).toContain('● [filesystem]');
    });

    it('não renderiza conteúdo quando isOpen for false', () => {
      const { lastFrame } = renderWithProviders(<PullSpecModal isOpen={false} />);
      expect(lastFrame()).toBe('');
    });
  });

  describe('Ao alternar provedores remotos', () => {
    it('permite alternar entre provedores usando Tab e setas', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <PullSpecModal isOpen={true} defaultProvider="github" />
      );

      // Focus starts at 'id'. Tab to 'name', then Tab to 'provider'
      stdin.write('\t');
      await tick();
      stdin.write('\t');
      await tick();

      expect(lastFrame() ?? '').toContain('[←/→] Select');

      // Right arrow cycles to linear
      stdin.write('\u001B[C');
      await tick();

      expect(lastFrame() ?? '').toContain('● [linear]');
    });
  });

  describe('Ao validar e submeter', () => {
    it('exibe erro de validação ao submeter com ID vazio', async () => {
      const { lastFrame, stdin } = renderWithProviders(<PullSpecModal isOpen={true} />);

      // Press Enter immediately on empty ID
      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Spec ID');
    });

    it('ao digitar o ID da issue e pressionar Enter, executa o PullSpecUseCase e chama onSuccess', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        kind: 'success',
        filename: 'issue-101',
        filePath: '.codeforge/specs/issue-101.md',
        spec: { id: '101', title: 'Issue 101' },
        content: '# Issue 101',
        overwritten: false,
      });
      const mockUseCase = {
        execute: mockExecute,
      } as unknown as PullSpecUseCase;

      const onSuccess = vi.fn();
      const onClose = vi.fn();

      const { stdin } = renderWithProviders(
        <PullSpecModal
          isOpen={true}
          pullSpecUseCase={mockUseCase}
          onSuccess={onSuccess}
          onClose={onClose}
        />
      );

      // Focus starts at 'id'. Type issue ID:
      stdin.write('101');
      await tick();

      // Submit with Enter
      stdin.write('\r');
      await tick();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '101',
        })
      );
      expect(onSuccess).toHaveBeenCalledWith('issue-101', '.codeforge/specs/issue-101.md');
      expect(onClose).toHaveBeenCalled();
    });

    it('exibe mensagem de erro explicativa quando a busca remota falha', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        kind: 'fetch-failed',
        error: 'HTTP 404 Issue Not Found',
      });
      const mockUseCase = {
        execute: mockExecute,
      } as unknown as PullSpecUseCase;

      const { lastFrame, stdin } = renderWithProviders(
        <PullSpecModal isOpen={true} pullSpecUseCase={mockUseCase} />
      );

      stdin.write('invalid-id');
      await tick();
      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('HTTP 404 Issue Not Found');
    });
  });

  describe('Ao cancelar a operação', () => {
    it('fecha o modal ao pressionar a tecla Escape', async () => {
      const onClose = vi.fn();
      const { stdin } = renderWithProviders(<PullSpecModal isOpen={true} onClose={onClose} />);

      stdin.write('\u001B'); // Esc
      await tick();

      expect(onClose).toHaveBeenCalled();
    });
  });
});
