import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';
import { ConfigureSpecSourceModal } from '../../../../../src/cli/tui/components/config/ConfigureSpecSourceModal.js';
import { CodeForgeConfig } from '../../../../../src/config/types.js';
import { ConfigService } from '../../../../../src/config/ConfigService.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ConfigureSpecSourceModal - Gerenciamento de Spec Source (BDD)', () => {
  const initialConfig: CodeForgeConfig = {
    environment: 'antigravity',
    plannerAgent: 'pro',
    executorAgent: 'flash',
    language: 'en',
    specSource: {
      provider: 'github',
      project: 'owner/repo',
      apiKey: '$GITHUB_TOKEN',
    },
  };

  describe('Visibilidade e Renderização Inicial', () => {
    it('não renderiza nada quando isOpen for false', () => {
      const { lastFrame } = renderWithProviders(
        <ConfigureSpecSourceModal isOpen={false} />
      );
      expect(lastFrame()).toBe('');
    });

    it('exibe cabeçalho, os 4 campos de configuração e o botão de salvar quando isOpen for true', () => {
      const { lastFrame } = renderWithProviders(
        <ConfigureSpecSourceModal isOpen={true} config={initialConfig} />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Configuração de Spec Source');
      expect(output).toContain('1. Provedor:');
      expect(output).toContain('● [github]');
      expect(output).toContain('2. Projeto / Repo (project):');
      expect(output).toContain('owner/repo');
      expect(output).toContain('3. Time / Workspace (team):');
      expect(output).toContain('4. Chave de API (apiKey):');
      expect(output).toContain('$GITHUB_TOKEN');
      expect(output).toContain('[ Salvar Spec Source ]');
    });
  });

  describe('Navegação e Alternância de Provedores', () => {
    it('ao pressionar Space ou setas no campo provedor, alterna circularmente entre opções', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigureSpecSourceModal isOpen={true} config={initialConfig} />
      );

      // Initial provider is github
      expect(lastFrame() ?? '').toContain('● [github]');

      // Press Space on provider field (index 0) to cycle to clickup
      stdin.write(' ');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('● [clickup]');
    });

    it('ao navegar com Tab, percorre sequencialmente os campos com foco visual', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigureSpecSourceModal isOpen={true} config={initialConfig} />
      );

      // Initial field is provider (index 0)
      expect(lastFrame() ?? '').toContain('1. Provedor:');
      expect(lastFrame() ?? '').toContain('● [github]');

      // Tab to project (index 1)
      stdin.write('\t');
      await tick();

      const projectOutput = lastFrame() ?? '';
      expect(projectOutput).toContain('> ');
      expect(projectOutput).toContain('owner/repo█');

      // Tab to team (index 2)
      stdin.write('\t');
      await tick();

      const teamOutput = lastFrame() ?? '';
      expect(teamOutput).toContain('Time / Workspace (team):');

      // Tab to apiKey (index 3)
      stdin.write('\t');
      await tick();

      const apiKeyOutput = lastFrame() ?? '';
      expect(apiKeyOutput).toContain('$GITHUB_TOKEN█');

      // Tab to save button (index 4)
      stdin.write('\t');
      await tick();

      const saveOutput = lastFrame() ?? '';
      expect(saveOutput).toContain('[ Salvar Spec Source ]');
    });
  });

  describe('Edição de Campos com TextInput', () => {
    it('ao digitar nos campos de texto, atualiza o valor e suporta backspace e Ctrl+U', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigureSpecSourceModal isOpen={true} config={initialConfig} />
      );

      // Tab to project (index 1)
      stdin.write('\t');
      await tick();

      // Type extra characters
      stdin.write('-v2');
      await tick();

      expect(lastFrame() ?? '').toContain('owner/repo-v2█');

      // Backspace
      stdin.write('\x08');
      await tick();

      expect(lastFrame() ?? '').toContain('owner/repo-v█');

      // Ctrl+U clears field
      stdin.write('\x15');
      await tick();

      expect(lastFrame() ?? '').toContain('ex: owner/repo');
    });
  });

  describe('Persistência e Auto-Save no ConfigService', () => {
    it('ao navegar até Salvar e pressionar Enter, persiste specSource no configService e fecha o modal', async () => {
      const mockSaveConfig = vi.fn();
      const mockConfigService = {
        loadConfig: () => initialConfig,
        saveConfig: mockSaveConfig,
      } as unknown as ConfigService;

      const onUpdateSpecSource = vi.fn();
      const onClose = vi.fn();

      const { stdin } = renderWithProviders(
        <ConfigureSpecSourceModal
          isOpen={true}
          config={initialConfig}
          configService={mockConfigService}
          onUpdateSpecSource={onUpdateSpecSource}
          onClose={onClose}
        />
      );

      // Tab to save button (4 tabs from index 0)
      for (let i = 0; i < 4; i++) {
        stdin.write('\t');
        await tick();
      }

      // Press Enter to save
      stdin.write('\r');
      await tick();

      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          specSource: {
            provider: 'github',
            project: 'owner/repo',
            apiKey: '$GITHUB_TOKEN',
          },
        })
      );
      expect(onUpdateSpecSource).toHaveBeenCalledWith({
        provider: 'github',
        project: 'owner/repo',
        apiKey: '$GITHUB_TOKEN',
      });
      expect(onClose).toHaveBeenCalled();
    });

    it('preenche apiKey padrão para o provedor e salva caso não seja modificada', async () => {
      const mockSaveConfig = vi.fn();
      const mockConfigService = {
        loadConfig: () => ({ environment: 'antigravity', specSource: { provider: 'github' } }),
        saveConfig: mockSaveConfig,
      } as unknown as ConfigService;

      const onUpdateSpecSource = vi.fn();

      const { stdin, lastFrame } = renderWithProviders(
        <ConfigureSpecSourceModal
          isOpen={true}
          config={{
            environment: 'antigravity',
            plannerAgent: 'pro',
            executorAgent: 'flash',
            language: 'pt',
            specSource: { provider: 'github' },
          }}
          configService={mockConfigService}
          onUpdateSpecSource={onUpdateSpecSource}
        />
      );

      expect(lastFrame() ?? '').toContain('$GITHUB_TOKEN');
      expect(lastFrame() ?? '').toContain('Padrão: $GITHUB_TOKEN');

      // Tab to save button (4 tabs)
      for (let i = 0; i < 4; i++) {
        stdin.write('\t');
        await tick();
      }

      // Press Enter to save without touching apiKey
      stdin.write('\r');
      await tick();

      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          specSource: {
            provider: 'github',
            apiKey: '$GITHUB_TOKEN',
          },
        })
      );
      expect(onUpdateSpecSource).toHaveBeenCalledWith({
        provider: 'github',
        apiKey: '$GITHUB_TOKEN',
      });
    });

    it('ao alternar o provedor, atualiza dinamicamente a apiKey padrão correspondente', async () => {
      const onUpdateSpecSource = vi.fn();

      const { stdin, lastFrame } = renderWithProviders(
        <ConfigureSpecSourceModal
          isOpen={true}
          config={{
            environment: 'antigravity',
            plannerAgent: 'pro',
            executorAgent: 'flash',
            language: 'pt',
            specSource: { provider: 'github' },
          }}
          onUpdateSpecSource={onUpdateSpecSource}
        />
      );

      expect(lastFrame() ?? '').toContain('● [github]');
      expect(lastFrame() ?? '').toContain('$GITHUB_TOKEN');

      // Cycle from github to clickup with Space
      stdin.write(' ');
      await tick();

      expect(lastFrame() ?? '').toContain('● [clickup]');
      expect(lastFrame() ?? '').toContain('$CLICKUP_API_KEY');
    });
  });

  describe('Ao cancelar a operação', () => {
    it('chama onClose ao pressionar a tecla Escape', async () => {
      const onClose = vi.fn();

      const { stdin } = renderWithProviders(
        <ConfigureSpecSourceModal
          isOpen={true}
          config={initialConfig}
          onClose={onClose}
        />
      );

      stdin.write('\u001B');
      await tick();

      expect(onClose).toHaveBeenCalled();
    });
  });
});
