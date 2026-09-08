import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';
import { ConfigureHooksModal } from '../../../../../src/cli/tui/components/config/ConfigureHooksModal.js';
import { deriveHookName } from '../../../../../src/cli/tui/components/config/hooks/useConfigureHooksModal.js';
import { HOOK_EVENTS } from '../../../../../src/domain/hook.js';
import { CodeForgeConfig } from '../../../../../src/config/types.js';
import { ConfigService } from '../../../../../src/config/ConfigService.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ConfigureHooksModal (TASK-002)', () => {
  describe('Modal Visibility and Nível 1 Rendering', () => {
    it('does not render when isOpen is false', () => {
      const { lastFrame } = renderWithProviders(
        <ConfigureHooksModal isOpen={false} />
      );
      expect(lastFrame()).toBe('');
    });

    it('renders Nível 1 with header, 8 events and badges when isOpen is true', () => {
      const initialConfig: CodeForgeConfig = {
        language: 'pt-BR',
        hooks: {
          'task.verify': [
            { name: 'lint', run: 'npm run lint', type: 'gate' },
            { name: 'test', run: 'npm test', type: 'gate' },
          ],
          'run.started': [
            { name: 'setup', run: 'npm run setup', type: 'notify' },
          ],
        },
      };

      const { lastFrame } = renderWithProviders(
        <ConfigureHooksModal isOpen={true} config={initialConfig} />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Configuração de Hooks');
      for (const event of HOOK_EVENTS) {
        expect(output).toContain(event);
      }
      expect(output).toContain('[2 hooks]');
      expect(output).toContain('[1 hook]');
      expect(output).toContain('[nenhum]');
      expect(output).toContain('[↑/↓ ou k/j] Navegar');
      expect(output).toContain('[Enter ou →] Selecionar');
      expect(output).toContain('[Esc/q] Voltar');
    });
  });

  describe('Transition to Nível 2 (Commands List)', () => {
    it('transitions to Nível 2 upon pressing Enter on an event', async () => {
      const initialConfig: CodeForgeConfig = {
        language: 'en',
        hooks: {
          'run.started': [
            { name: 'setup', run: 'npm run setup', type: 'notify' },
          ],
        },
      };

      const { lastFrame, stdin } = renderWithProviders(
        <ConfigureHooksModal isOpen={true} config={initialConfig} />
      );

      expect(lastFrame() ?? '').toContain('Configuração de Hooks - Selecione o Evento');

      // Press Enter on run.started (index 0)
      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Hooks do Evento: run.started');
      expect(output).toContain('[+ Adicionar Novo Comando]');
      expect(output).toContain('1.');
      expect(output).toContain('setup');
      expect(output).toContain('npm run setup');
      expect(output).toContain('[NOTIFY]');
      expect(output).toContain('[↑/↓] Navegar');
      expect(output).toContain('[Enter] Selecionar/Editar');
      expect(output).toContain('[e] Editar');
      expect(output).toContain('[d] Excluir');
    });
  });

  describe('Nível 3 Inclusion Flow (Add Hook, Type Toggle & Auto-Save)', () => {
    it('handles inclusion flow: add, type command, toggle to gate, submit and persist', async () => {
      const mockSaveConfig = vi.fn();
      const mockConfigService = {
        saveConfig: mockSaveConfig,
      } as unknown as ConfigService;
      const onUpdateHooks = vi.fn();

      const initialConfig: CodeForgeConfig = {
        language: 'en',
        hooks: {},
      };

      const { lastFrame, stdin } = renderWithProviders(
        <ConfigureHooksModal
          isOpen={true}
          config={initialConfig}
          configService={mockConfigService}
          onUpdateHooks={onUpdateHooks}
        />
      );

      // Navigate down 5 times to task.verify (run.started -> run.completed -> run.failed -> run.deadlock -> task.started -> task.verify)
      for (let i = 0; i < 5; i++) {
        stdin.write('\x1b[B'); // down arrow
        await tick(20);
      }

      // Enter into task.verify
      stdin.write('\r');
      await tick();

      expect(lastFrame() ?? '').toContain('Hooks do Evento: task.verify');
      expect(lastFrame() ?? '').toContain('[+ Adicionar Novo Comando]');

      // Enter on [+ Adicionar Novo Comando]
      stdin.write('\r');
      await tick();

      // In Nível 3 Form
      expect(lastFrame() ?? '').toContain('Adicionar Novo Hook — task.verify');
      expect(lastFrame() ?? '').toContain('Comando (run) *:');

      // Type command
      stdin.write('npm test');
      await tick();

      // Tab to type field
      stdin.write('\t');
      await tick();

      // Toggle type to gate with Space
      stdin.write(' ');
      await tick();

      // Submit with Enter
      stdin.write('\r');
      await tick();

      // Verify auto-save persistence immediately
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          hooks: expect.objectContaining({
            'task.verify': [
              {
                name: 'npm',
                run: 'npm test',
                type: 'gate',
              },
            ],
          }),
        })
      );

      // Verify callback triggered
      expect(onUpdateHooks).toHaveBeenCalledWith(
        expect.objectContaining({
          'task.verify': [
            {
              name: 'npm',
              run: 'npm test',
              type: 'gate',
            },
          ],
        })
      );

      // Returned to Nível 2 with feedback message and new command
      const output = lastFrame() ?? '';
      expect(output).toContain('Hooks do Evento: task.verify');
      expect(output).toContain('npm test');
      expect(output).toContain('[GATE]');
      expect(output).toContain('✔ Hook salvo com sucesso no config.yaml');
    });

    it('validates empty command in form before saving', async () => {
      const mockSaveConfig = vi.fn();
      const mockConfigService = {
        saveConfig: mockSaveConfig,
      } as unknown as ConfigService;

      const { lastFrame, stdin } = renderWithProviders(
        <ConfigureHooksModal
          isOpen={true}
          configService={mockConfigService}
        />
      );

      // Enter into run.started
      stdin.write('\r');
      await tick();

      // Enter into [+ Adicionar Novo Comando]
      stdin.write('\r');
      await tick();

      // Press Enter immediately with empty command
      stdin.write('\r');
      await tick();

      expect(lastFrame() ?? '').toContain('✗ O comando (run) é obrigatório.');
      expect(mockSaveConfig).not.toHaveBeenCalled();
    });

    it('supports custom name input in form', async () => {
      const mockSaveConfig = vi.fn();
      const mockConfigService = {
        saveConfig: mockSaveConfig,
      } as unknown as ConfigService;

      const { stdin } = renderWithProviders(
        <ConfigureHooksModal
          isOpen={true}
          configService={mockConfigService}
        />
      );

      // Open Nível 2
      stdin.write('\r');
      await tick();

      // Open Nível 3 (Form)
      stdin.write('\r');
      await tick();

      // Type run command
      stdin.write('pytest tests/unit');
      await tick();

      // Tab to type
      stdin.write('\t');
      await tick();

      // Tab to name
      stdin.write('\t');
      await tick();

      // Type custom name
      stdin.write('unit-test-runner');
      await tick();

      // Submit with Enter
      stdin.write('\r');
      await tick();

      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          hooks: expect.objectContaining({
            'run.started': [
              {
                name: 'unit-test-runner',
                run: 'pytest tests/unit',
                type: 'notify',
              },
            ],
          }),
        })
      );
    });
  });

  describe('Nível 3 Editing Flow', () => {
    it('handles edit flow: select command, press "e", edit command, save and persist', async () => {
      const mockSaveConfig = vi.fn();
      const mockConfigService = {
        saveConfig: mockSaveConfig,
      } as unknown as ConfigService;
      const onUpdateHooks = vi.fn();

      const initialConfig: CodeForgeConfig = {
        language: 'en',
        hooks: {
          'run.started': [
            { name: 'setup', run: 'npm run setup', type: 'notify' },
          ],
        },
      };

      const { lastFrame, stdin } = renderWithProviders(
        <ConfigureHooksModal
          isOpen={true}
          config={initialConfig}
          configService={mockConfigService}
          onUpdateHooks={onUpdateHooks}
        />
      );

      // Enter into run.started (index 0)
      stdin.write('\r');
      await tick();

      // Down arrow to command 1 (setup)
      stdin.write('\x1b[B');
      await tick();

      // Press 'e' to edit
      stdin.write('e');
      await tick();

      expect(lastFrame() ?? '').toContain('Editar Hook — run.started');
      expect(lastFrame() ?? '').toContain('npm run setup');

      // Add text to command
      stdin.write(':dev');
      await tick();

      // Submit with Enter
      stdin.write('\r');
      await tick();

      // Verify persistence call
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          hooks: {
            'run.started': [
              {
                name: 'setup',
                run: 'npm run setup:dev',
                type: 'notify',
              },
            ],
          },
        })
      );

      expect(onUpdateHooks).toHaveBeenCalled();
      expect(lastFrame() ?? '').toContain('npm run setup:dev');
      expect(lastFrame() ?? '').toContain('✔ Hook salvo com sucesso no config.yaml');
    });
  });

  describe('Nível 2 Deletion Flow', () => {
    it('handles deletion flow with cancellation (n / Esc) and confirmation (y)', async () => {
      const mockSaveConfig = vi.fn();
      const mockConfigService = {
        saveConfig: mockSaveConfig,
      } as unknown as ConfigService;
      const onUpdateHooks = vi.fn();

      const initialConfig: CodeForgeConfig = {
        language: 'en',
        hooks: {
          'run.started': [
            { name: 'setup', run: 'npm run setup', type: 'notify' },
          ],
        },
      };

      const { lastFrame, stdin } = renderWithProviders(
        <ConfigureHooksModal
          isOpen={true}
          config={initialConfig}
          configService={mockConfigService}
          onUpdateHooks={onUpdateHooks}
        />
      );

      // Enter into run.started
      stdin.write('\r');
      await tick();

      // Down arrow to item 1 (setup)
      stdin.write('\x1b[B');
      await tick();

      // 1. Press 'd' -> shows delete confirmation prompt
      stdin.write('d');
      await tick();
      expect(lastFrame() ?? '').toContain('Excluir este comando? [y/N]');

      // Cancel with 'n'
      stdin.write('n');
      await tick();
      expect(lastFrame() ?? '').not.toContain('Excluir este comando? [y/N]');
      expect(mockSaveConfig).not.toHaveBeenCalled();

      // 2. Press 'd' -> prompts again
      stdin.write('d');
      await tick();
      expect(lastFrame() ?? '').toContain('Excluir este comando? [y/N]');

      // Cancel with Esc
      stdin.write('\u001B');
      await tick();
      expect(lastFrame() ?? '').not.toContain('Excluir este comando? [y/N]');
      expect(mockSaveConfig).not.toHaveBeenCalled();

      // 3. Press 'd' -> confirm with 'y'
      stdin.write('d');
      await tick();
      expect(lastFrame() ?? '').toContain('Excluir este comando? [y/N]');

      stdin.write('y');
      await tick();

      // Verified deletion persisted immediately
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          hooks: {
            'run.started': [],
          },
        })
      );
      expect(onUpdateHooks).toHaveBeenCalledWith({
        'run.started': [],
      });

      const output = lastFrame() ?? '';
      expect(output).toContain('✔ Hook removido com sucesso');
      expect(output).toContain('(Nenhum comando configurado para este evento)');
    });
  });

  describe('Reverse Navigation with Esc', () => {
    it('handles reverse navigation with Esc from Form -> Commands -> Events -> Close', async () => {
      const onClose = vi.fn();

      const { lastFrame, stdin } = renderWithProviders(
        <ConfigureHooksModal isOpen={true} onClose={onClose} />
      );

      // Nível 1: Events
      expect(lastFrame() ?? '').toContain('Configuração de Hooks - Selecione o Evento');

      // Go to Nível 2: Commands
      stdin.write('\r');
      await tick();
      expect(lastFrame() ?? '').toContain('Hooks do Evento: run.started');

      // Go to Nível 3: Form
      stdin.write('\r');
      await tick();
      expect(lastFrame() ?? '').toContain('Adicionar Novo Hook — run.started');

      // 1. Esc in Form -> returns to Commands
      stdin.write('\u001B');
      await tick();
      expect(lastFrame() ?? '').toContain('Hooks do Evento: run.started');
      expect(onClose).not.toHaveBeenCalled();

      // 2. Esc in Commands -> returns to Events
      stdin.write('\u001B');
      await tick();
      expect(lastFrame() ?? '').toContain('Configuração de Hooks - Selecione o Evento');
      expect(onClose).not.toHaveBeenCalled();

      // 3. Esc in Events -> closes modal
      stdin.write('\u001B');
      await tick();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('supports "q" to close in Nível 1 and left arrow to return from Nível 2', async () => {
      const onClose = vi.fn();

      const { lastFrame, stdin } = renderWithProviders(
        <ConfigureHooksModal isOpen={true} onClose={onClose} />
      );

      // Enter into Nível 2
      stdin.write('\r');
      await tick();
      expect(lastFrame() ?? '').toContain('Hooks do Evento: run.started');

      // Left arrow to return to Nível 1
      stdin.write('\x1b[D');
      await tick();
      expect(lastFrame() ?? '').toContain('Configuração de Hooks - Selecione o Evento');

      // 'q' to close
      stdin.write('q');
      await tick();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('deriveHookName utility', () => {
    it('derives first term of the command as name', () => {
      expect(deriveHookName('npm run lint', 'task.verify')).toBe('npm');
      expect(deriveHookName('pytest tests/unit', 'task.verify')).toBe('pytest');
      expect(deriveHookName('eslint .', 'task.verify')).toBe('eslint');
    });

    it('falls back to event hook timestamp when empty or only special characters', () => {
      const nameEmpty = deriveHookName('', 'task.verify');
      expect(nameEmpty).toMatch(/^task\.verify-hook-\d+$/);

      const nameSpecial = deriveHookName('$$$', 'run.started');
      expect(nameSpecial).toMatch(/^run\.started-hook-\d+$/);
    });
  });
});
