import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ConfigScreen } from '../../../../../src/cli/tui/components/config/ConfigScreen.js';
import { ConfigService } from '../../../../../src/config/ConfigService.js';
import { CodeForgeConfig } from '../../../../../src/config/types.js';
import { renderWithProviders, flushAsync } from '../../helpers/renderWithProviders.js';

describe('ConfigScreen component', () => {
  const mockConfig: CodeForgeConfig = {
    environment: 'antigravity',
    plannerAgent: 'pro',
    executorAgent: 'flash',
    language: 'en',
    hooks: {
      'run.started': [{ name: 'test', run: 'npm run test:fast' }],
    },
    specSource: {
      provider: 'filesystem',
    },
  };

  it('renders project configuration items', () => {
    const { lastFrame } = renderWithProviders(
      <ConfigScreen initialConfig={mockConfig} isInteractive={false} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('CodeForge Configuration Editor');
    expect(output).toContain('1. Language (i18n):');
    expect(output).toContain('● [en]');
    expect(output).toContain('antigravity');
    expect(output).toContain('5. Hooks:');
    expect(output).toContain('configurados ]');
    expect(output).toContain('6. Spec Source:');
    expect(output).toContain('filesystem');
  });

  it('opens ConfigureHooksModal on hooks field with Enter and persists changes', async () => {
    const mockSaveConfig = vi.fn();
    const mockConfigService = {
      loadConfig: () => mockConfig,
      saveConfig: mockSaveConfig,
    } as unknown as ConfigService;

    const { lastFrame, stdin } = renderWithProviders(
      <ConfigScreen
        configService={mockConfigService}
        initialConfig={mockConfig}
        isInteractive={true}
      />
    );

    // Navigate to hooks field (index 4 in FIELD_ORDER)
    for (let i = 0; i < 4; i++) {
      stdin.write('j');
    }
    await flushAsync();

    // Open hooks modal
    stdin.write('\r');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Configuração de Hooks');

    // Select run.started (index 0) to view commands list
    stdin.write('\r');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Hooks do Evento: run.started');

    // Select [+ Adicionar Novo Comando]
    stdin.write('\r');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Adicionar Novo Hook — run.started');

    // Type command and submit
    stdin.write('npm test');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        hooks: expect.objectContaining({
          'run.started': expect.arrayContaining([
            expect.objectContaining({ run: 'npm test' }),
          ]),
        }),
      })
    );
  });

  it('opens ConfigureSpecSourceModal on specSource field with Enter and persists changes', async () => {
    const mockSaveConfig = vi.fn();
    const mockConfigService = {
      loadConfig: () => mockConfig,
      saveConfig: mockSaveConfig,
    } as unknown as ConfigService;

    const { lastFrame, stdin } = renderWithProviders(
      <ConfigScreen
        configService={mockConfigService}
        initialConfig={mockConfig}
        isInteractive={true}
      />
    );

    // Navigate to specSource field (index 5 in FIELD_ORDER)
    for (let i = 0; i < 5; i++) {
      stdin.write('j');
    }
    await flushAsync();

    // Open specSource modal
    stdin.write('\r');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Configuração de Spec Source');

    // Cycle provider with Space
    stdin.write(' ');
    await flushAsync();

    // Tab 4 times to reach "[ Salvar Spec Source ]" button
    for (let i = 0; i < 4; i++) {
      stdin.write('\t');
    }
    await flushAsync();

    // Press Enter to submit save
    stdin.write('\r');
    await flushAsync();

    expect(mockSaveConfig).toHaveBeenCalled();
  });
});