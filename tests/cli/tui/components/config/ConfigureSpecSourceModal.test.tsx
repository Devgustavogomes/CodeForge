import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';
import { ConfigureSpecSourceModal } from '../../../../../src/cli/tui/components/config/ConfigureSpecSourceModal.js';
import { CodeForgeConfig } from '../../../../../src/config/types.js';
import { ConfigService } from '../../../../../src/config/ConfigService.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ConfigureSpecSourceModal', () => {
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

  it('does not render when isOpen is false', () => {
    const { lastFrame } = renderWithProviders(
      <ConfigureSpecSourceModal isOpen={false} />
    );
    expect(lastFrame()).toBe('');
  });

  it('renders header, all 4 fields and save button when isOpen is true', () => {
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

  it('cycles provider when Space or arrow is pressed on provider field', async () => {
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

  it('navigates through fields using Tab and Shift+Tab', async () => {
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

  it('edits text field and allows deletion with backspace and Ctrl+U', async () => {
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

  it('saves specSource to configService and calls onUpdateSpecSource and onClose on Enter', async () => {
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
    stdin.write('\t');
    await tick();
    stdin.write('\t');
    await tick();
    stdin.write('\t');
    await tick();
    stdin.write('\t');
    await tick();

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

  it('calls onClose when Esc is pressed', async () => {
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

  it('pre-fills default apiKey when none is provided and saves it if untouched', async () => {
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
          specSource: { provider: 'github' }, // No apiKey specified
        }}
        configService={mockConfigService}
        onUpdateSpecSource={onUpdateSpecSource}
      />
    );

    // Form displays the default $GITHUB_TOKEN
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

  it('automatically updates apiKey to next provider default when cycling if untouched', async () => {
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
