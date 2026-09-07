import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ConfigScreen } from '../../../../../src/cli/tui/components/config/ConfigScreen.js';
import { ConfigFeedback } from '../../../../../src/cli/tui/components/config/components/ConfigFeedback.js';
import { ConfigField } from '../../../../../src/cli/tui/components/config/components/ConfigField.js';
import { ConfigService } from '../../../../../src/config/ConfigService.js';
import { CodeForgeConfig } from '../../../../../src/config/types.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ConfigScreen component', () => {
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

  it('renders configuration form with language, runners, and hooks', () => {
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
    expect(output).toContain('npm run test:fast');
  });

  it('toggles language when Space or Arrow is pressed', async () => {
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

  it('persists changes to config service on quick save "s"', async () => {
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

    // Change language to 'pt'
    stdin.write(' ');
    await tick();

    // Press 's' to save
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

  it('renders ConfigFeedback component with alert message and unsaved status', () => {
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

  it('renders ConfigField component for environment field', () => {
    const { lastFrame } = renderWithProviders(
      <ConfigField
        fieldKey="environment"
        isActive={true}
        isEditing={false}
        editValue=""
        config={mockConfig}
        availableEnvironments={['antigravity', 'claude']}
        currentAgentOptions={['pro', 'flash']}
        getHookCommand={() => ''}
      />
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('2. Runner Environment:');
    expect(output).toContain('antigravity');
    expect(output).toContain('[Space/←/→] toggle');
  });
});
