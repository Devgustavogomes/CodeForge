import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ConfigScreen } from '../../../../../src/cli/tui/components/config/ConfigScreen.js';
import { ConfigService } from '../../../../../src/config/ConfigService.js';
import { CodeForgeConfig } from '../../../../../src/config/types.js';

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
    const { lastFrame } = render(
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
    const { lastFrame, stdin } = render(
      <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
    );

    // Language field is active by default. Press Space to cycle language:
    stdin.write(' ');
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('● [pt]');
  });

  it('persists changes to config service on quick save "s"', async () => {
    const mockSaveConfig = vi.fn();
    const mockConfigService = {
      loadConfig: () => mockConfig,
      saveConfig: mockSaveConfig,
    } as unknown as ConfigService;

    const onSave = vi.fn();

    const { lastFrame, stdin } = render(
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
});
