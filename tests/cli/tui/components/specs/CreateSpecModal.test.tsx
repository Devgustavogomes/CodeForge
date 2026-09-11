import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { CreateSpecModal } from '../../../../../src/cli/tui/components/specs/CreateSpecModal.js';
import { CreateSpecUseCase } from '../../../../../src/application/use-cases/CreateSpecUseCase.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('CreateSpecModal - Fluxo de Criação de Especificação (BDD)', () => {
  describe('Ao abrir o modal', () => {
    it('exibe o título, campo de texto, placeholders e atalhos de teclado', () => {
      const { lastFrame } = renderWithProviders(<CreateSpecModal isOpen={true} />);
      const output = lastFrame() ?? '';

      expect(output).toContain('Create Specification');
      expect(output).toContain('Enter a descriptive title or slug');
      expect(output).toContain('[Enter] Create');
      expect(output).toContain('[Esc] Cancel');
    });

    it('não renderiza nada quando isOpen for false', () => {
      const { lastFrame } = renderWithProviders(<CreateSpecModal isOpen={false} />);
      expect(lastFrame()).toBe('');
    });
  });

  describe('Ao validar e submeter dados', () => {
    it('exibe mensagem de validação ao tentar submeter com o campo vazio', async () => {
      const { lastFrame, stdin } = renderWithProviders(<CreateSpecModal isOpen={true} />);

      // Pressiona Enter imediatamente sem digitar
      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Specification title cannot be empty');
    });

    it('ao digitar o título e pressionar Enter, executa CreateSpecUseCase e chama callbacks de sucesso', async () => {
      const mockExecute = vi.fn().mockReturnValue({
        kind: 'created',
        filePath: '.codeforge/specs/auth-service.md',
      });
      const mockUseCase = {
        execute: mockExecute,
      } as unknown as CreateSpecUseCase;

      const onSuccess = vi.fn();
      const onClose = vi.fn();

      const { stdin } = renderWithProviders(
        <CreateSpecModal
          isOpen={true}
          createSpecUseCase={mockUseCase}
          onSuccess={onSuccess}
          onClose={onClose}
        />
      );

      // Digita o nome da especificação
      stdin.write('Auth Service');
      await tick();

      // Submete com Enter
      stdin.write('\r');
      await tick();

      expect(mockExecute).toHaveBeenCalledWith('Auth Service');
      expect(onSuccess).toHaveBeenCalledWith('auth-service', '.codeforge/specs/auth-service.md');
      expect(onClose).toHaveBeenCalled();
    });

    it('exibe mensagem de erro explicativa caso a especificação já exista em disco', async () => {
      const mockExecute = vi.fn().mockReturnValue({
        kind: 'already-exists',
        filePath: '.codeforge/specs/existing.md',
      });
      const mockUseCase = {
        execute: mockExecute,
      } as unknown as CreateSpecUseCase;

      const { lastFrame, stdin } = renderWithProviders(
        <CreateSpecModal isOpen={true} createSpecUseCase={mockUseCase} />
      );

      stdin.write('existing');
      await tick();
      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('already exists');
    });
  });

  describe('Ao cancelar a operação', () => {
    it('chama onClose ao pressionar a tecla Escape', async () => {
      const onClose = vi.fn();
      const { stdin } = renderWithProviders(<CreateSpecModal isOpen={true} onClose={onClose} />);

      stdin.write('\u001B'); // Esc
      await tick();

      expect(onClose).toHaveBeenCalled();
    });
  });
});
