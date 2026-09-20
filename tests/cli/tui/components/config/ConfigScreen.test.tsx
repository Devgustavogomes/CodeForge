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
    intentSource: {
      provider: 'filesystem',
    },
  };

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

  it('opens ConfigureIntentSourceModal on intentSource field with Enter and persists changes', async () => {
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

    // Navigate to intentSource field (index 5 in FIELD_ORDER)
    for (let i = 0; i < 5; i++) {
      stdin.write('j');
    }
    await flushAsync();

    // Open intentSource modal
    stdin.write('\r');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Configuração de Intent Source');

    // Cycle provider with Space
    stdin.write(' ');
    await flushAsync();

    // Tab 4 times to reach "[ Salvar Intent Source ]" button
    for (let i = 0; i < 4; i++) {
      stdin.write('\t');
    }
    await flushAsync();

    // Press Enter to submit save
    stdin.write('\r');
    await flushAsync();

    expect(mockSaveConfig).toHaveBeenCalled();
  });

  it('renders AI Review defaults and edits the nested configuration', async () => {
    const mockSaveConfig = vi.fn();
    const mockConfigService = {
      loadConfig: () => mockConfig,
      saveConfig: mockSaveConfig,
    } as unknown as ConfigService;
    const container = {
      configureEnvironmentUseCase: {
        getAvailableEnvironments: () => ['antigravity'],
        getAgentsForEnvironment: async () => ['reviewer-a', 'reviewer-b'],
      },
    };

    const { lastFrame, stdin } = renderWithProviders(
      <ConfigScreen
        container={container as never}
        configService={mockConfigService}
        initialConfig={mockConfig}
        isInteractive={true}
      />,
    );

    await flushAsync();
    for (let i = 0; i < 6; i++) stdin.write('j');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('AI Review:');
    expect(lastFrame() ?? '').toContain('[ Disabled ]');
    expect(lastFrame() ?? '').toContain('Maximum rounds: 3');
    expect(lastFrame() ?? '').toContain('AI Review Configuration');

    stdin.write('\r');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('AI Review configuration');
    stdin.write(' ');
    await flushAsync();
    stdin.write('\x1B[B');
    await flushAsync();
    stdin.write('\x1B[C');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Enabled: Yes');
    expect(lastFrame() ?? '').toContain('Agent: reviewer-a');

    stdin.write('\x1B[B');
    await flushAsync();
    await flushAsync();
    stdin.write('5');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();
    stdin.write('s');
    await flushAsync();

    expect(mockSaveConfig).toHaveBeenCalledWith(expect.objectContaining({
      aiReview: { enabled: true, agent: 'reviewer-a', maxRounds: 5 },
      hooks: mockConfig.hooks,
      intentSource: mockConfig.intentSource,
    }));
  });

  it('rejects a non-positive AI Review maximum-round value', async () => {
    const mockConfigService = {
      loadConfig: () => mockConfig,
      saveConfig: vi.fn(),
    } as unknown as ConfigService;
    const { lastFrame, stdin } = renderWithProviders(
      <ConfigScreen configService={mockConfigService} initialConfig={mockConfig} isInteractive={true} />,
    );

    for (let i = 0; i < 6; i++) stdin.write('j');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();
    stdin.write('\x1B[B');
    await flushAsync();
    stdin.write('\x1B[B');
    await flushAsync();
    stdin.write('0');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Maximum review rounds must be a positive');
    expect(lastFrame() ?? '').toContain('integer.');
  });
});
