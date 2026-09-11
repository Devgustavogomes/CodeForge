import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ConfigScreen } from '../../../../../src/cli/tui/components/config/ConfigScreen.js';
import { useConfigScreen } from '../../../../../src/cli/tui/components/config/hooks/useConfigScreen.js';
import { ConfigFeedback } from '../../../../../src/cli/tui/components/config/components/ConfigFeedback.js';
import { ConfigField } from '../../../../../src/cli/tui/components/config/components/ConfigField.js';
import { ConfigService } from '../../../../../src/config/ConfigService.js';
import { CodeForgeConfig } from '../../../../../src/config/types.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ConfigScreen - Tela de Configuração (BDD)', () => {
  const mockConfig: CodeForgeConfig = {
    environment: 'antigravity',
    plannerAgent: 'pro',
    executorAgent: 'flash',
    language: 'en',
    hooks: {
      'run.started': [{ name: 'test', run: 'npm run test:fast' }],
      'run.completed': [{ name: 'notify', run: 'echo done' }],
    },
  };

  describe('Renderização e Visualização de Campos', () => {
    it('ao carregar a tela, exibe o formulário completo com idioma, runners, hooks e spec source', () => {
      const { lastFrame } = renderWithProviders(
        <ConfigScreen initialConfig={mockConfig} isInteractive={false} />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('CodeForge Configuration Editor');
      expect(output).toContain('1. Language (i18n):');
      expect(output).toContain('● [en]');
      expect(output).toContain('antigravity');
      expect(output).toContain('pro');
      expect(output).toContain('flash');
      expect(output).toContain('5. Hooks:');
      expect(output).toContain('[ 2 configurados ]');
      expect(output).toContain('6. Spec Source:');
      expect(output).toContain('filesystem');
      expect(output).not.toContain('Pre-Run Hook');
      expect(output).not.toContain('Post-Run Hook');
    });

    it('ao renderizar o componente ConfigFeedback, exibe alerta e status de alterações pendentes', () => {
      const { lastFrame } = renderWithProviders(
        <ConfigFeedback
          feedback={{ type: 'success', message: 'Config saved' }}
          isDirty={true}
        />
      );
      const output = lastFrame() ?? '';
      expect(output).toContain('Config saved');
      expect(output).toContain('Unsaved Changes');
    });

    it('renderiza o campo environment via dispatcher ConfigField', () => {
      const { lastFrame } = renderWithProviders(
        <ConfigField
          fieldKey="environment"
          isActive={true}
          isEditing={false}
          editValue=""
          config={mockConfig}
          availableEnvironments={['antigravity', 'claude']}
          currentAgentOptions={['pro', 'flash']}
        />
      );
      const output = lastFrame() ?? '';
      expect(output).toContain('2. Runner Environment:');
      expect(output).toContain('antigravity');
    });

    it('renderiza o campo hooks com contagem consolidada via dispatcher ConfigField', () => {
      const { lastFrame } = renderWithProviders(
        <ConfigField
          fieldKey="hooks"
          isActive={true}
          isEditing={false}
          editValue=""
          config={mockConfig}
          availableEnvironments={['antigravity', 'claude']}
          currentAgentOptions={['pro', 'flash']}
        />
      );
      const output = lastFrame() ?? '';
      expect(output).toContain('5. Hooks:');
      expect(output).toContain('[ 2 configurados ]');
    });

    it('renderiza o campo specSource com detalhes via dispatcher ConfigField', () => {
      const { lastFrame } = renderWithProviders(
        <ConfigField
          fieldKey="specSource"
          isActive={true}
          isEditing={false}
          editValue=""
          config={{
            ...mockConfig,
            specSource: { provider: 'github', project: 'org/repo' },
          }}
          availableEnvironments={['antigravity', 'claude']}
          currentAgentOptions={['pro', 'flash']}
        />
      );
      const output = lastFrame() ?? '';
      expect(output).toContain('6. Spec Source:');
      expect(output).toContain('github (org/repo)');
    });

    it('ao selecionar o campo hooks, exibe resumo categorizado e atalho no painel de preview', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
      );

      // Navigate to hooks field:
      for (let i = 0; i < 4; i++) {
        stdin.write('j');
        await tick();
      }

      const output = lastFrame() ?? '';
      expect(output).toContain('Hooks Summary');
      expect(output).toContain('run.started: 1 hook [notify]');
      expect(output).toContain('run.completed: 1 hook [notify]');
      expect(output).toContain('outros: 0');
      expect(output).toContain('[Enter] Abrir Gerenciador de Hooks');
    });
  });

  describe('Navegação e Alternância de Opções', () => {
    it('ao pressionar Espaço ou Setas no campo language, alterna o idioma selecionado e marca como dirty', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
      );

      // Language field is active by default. Press Space to cycle language:
      stdin.write(' ');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('● [pt]');
      expect(output).toContain('Unsaved Changes');
    });
  });

  describe('Abertura e Fechamento de Modais', () => {
    it('ao pressionar Enter no campo hooks, abre o ConfigureHooksModal', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
      );

      for (let i = 0; i < 4; i++) {
        stdin.write('j');
        await tick();
      }

      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Configuração de Hooks');
      expect(output).toContain('run.started');
      expect(output).toContain('task.verify');
      expect(output).not.toContain('CodeForge Configuration Editor');
      expect(output).not.toContain('Hooks Summary');
    });

    it('ao pressionar Espaço no campo hooks, abre o ConfigureHooksModal', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
      );

      for (let i = 0; i < 4; i++) {
        stdin.write('j');
        await tick();
      }

      stdin.write(' ');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Configuração de Hooks');
    });

    it('ao pressionar Seta Direita no campo hooks, abre o ConfigureHooksModal', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
      );

      for (let i = 0; i < 4; i++) {
        stdin.write('j');
        await tick();
      }

      stdin.write('\u001B[C');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Configuração de Hooks');
    });

    it('ao pressionar Esc no ConfigureHooksModal, fecha o modal e retorna para a tela principal', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
      );

      for (let i = 0; i < 4; i++) {
        stdin.write('j');
        await tick();
      }
      stdin.write('\r');
      await tick();

      const modalOutput = lastFrame() ?? '';
      expect(modalOutput).toContain('Configuração de Hooks');
      expect(modalOutput).not.toContain('CodeForge Configuration Editor');

      stdin.write('\u001B');
      await tick();

      const closedOutput = lastFrame() ?? '';
      expect(closedOutput).not.toContain('Configuração de Hooks - Ciclo de Vida');
      expect(closedOutput).toContain('CodeForge Configuration Editor');
    });

    it('ao pressionar Enter no campo specSource, abre o ConfigureSpecSourceModal', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
      );

      for (let i = 0; i < 5; i++) {
        stdin.write('j');
        await tick();
      }

      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Configuração de Spec Source');
      expect(output).toContain('1. Provedor:');
      expect(output).not.toContain('CodeForge Configuration Editor');
    });

    it('ao pressionar Espaço no campo specSource, abre o ConfigureSpecSourceModal', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
      );

      for (let i = 0; i < 5; i++) {
        stdin.write('j');
        await tick();
      }

      stdin.write(' ');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Configuração de Spec Source');
    });

    it('ao pressionar Esc no ConfigureSpecSourceModal, fecha o modal e retorna à tela de configuração', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
      );

      for (let i = 0; i < 5; i++) {
        stdin.write('j');
        await tick();
      }

      stdin.write('\r');
      await tick();

      const modalOutput = lastFrame() ?? '';
      expect(modalOutput).toContain('Configuração de Spec Source');

      stdin.write('\u001B');
      await tick();

      const closedOutput = lastFrame() ?? '';
      expect(closedOutput).not.toContain('Configuração de Spec Source');
      expect(closedOutput).toContain('CodeForge Configuration Editor');
    });
  });

  describe('Persistência e Gerenciamento de Estado', () => {
    it('ao pressionar "s", salva rapidamente a configuração no ConfigService e notifica callback onSave', async () => {
      const mockSaveConfig = vi.fn();
      const mockConfigService = {
        loadConfig: () => mockConfig,
        saveConfig: mockSaveConfig,
      } as unknown as ConfigService;

      const onSave = vi.fn();

      const { lastFrame, stdin } = renderWithProviders(
        <ConfigScreen
          configService={mockConfigService}
          initialConfig={mockConfig}
          onSave={onSave}
          isInteractive={true}
        />
      );

      stdin.write(' ');
      await tick();

      stdin.write('s');
      await tick();

      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'pt',
        })
      );
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'pt',
        })
      );

      const output = lastFrame() ?? '';
      expect(output).toContain('successfully saved');
    });

    it('ao atualizar hooks via handleUpdateHooks, atualiza estado de configuração sem marcar dirty', async () => {
      let capturedState: any;
      const TestComponent = () => {
        capturedState = useConfigScreen({ initialConfig: mockConfig });
        return null;
      };
      renderWithProviders(<TestComponent />);

      expect(capturedState.isDirty).toBe(false);
      expect(capturedState.config.hooks?.['run.started']).toHaveLength(1);

      capturedState.handleUpdateHooks({
        ...mockConfig.hooks,
        'run.started': [
          { name: 'test1', run: 'echo 1' },
          { name: 'test2', run: 'echo 2' },
        ],
      });
      await tick();

      expect(capturedState.isDirty).toBe(false);
      expect(capturedState.config.hooks?.['run.started']).toHaveLength(2);
    });

    it('ao atualizar specSource via handleUpdateSpecSource, atualiza configuração em memória', async () => {
      let capturedState: any;
      const TestComponent = () => {
        capturedState = useConfigScreen({ initialConfig: mockConfig });
        return null;
      };
      renderWithProviders(<TestComponent />);

      expect(capturedState.config.specSource).toBeUndefined();

      capturedState.handleUpdateSpecSource({
        provider: 'linear',
        team: 'ENG',
        apiKey: '$LINEAR_API_KEY',
      });
      await tick();

      expect(capturedState.config.specSource?.provider).toBe('linear');
      expect(capturedState.config.specSource?.team).toBe('ENG');
      expect(capturedState.config.specSource?.apiKey).toBe('$LINEAR_API_KEY');
    });
  });
});