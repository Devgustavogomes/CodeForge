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
    expect(output).toContain('5. Hooks:');
    expect(output).toContain('[ 2 configurados ]');
    expect(output).not.toContain('Pre-Run Hook');
    expect(output).not.toContain('Post-Run Hook');
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
      />
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('2. Runner Environment:');
    expect(output).toContain('antigravity');
  });

  it('renders ConfigField component for hooks field', () => {
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

  it('opens ConfigureHooksModal when Enter is pressed on hooks field', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
    );

    // Navigate to hooks field (index 4) by pressing 'j' 4 times:
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();

    // At index 4 ('hooks'), press Enter to open ConfigureHooksModal:
    stdin.write('\r');
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('Configuração de Hooks');
    expect(output).toContain('run.started');
    expect(output).toContain('task.verify');
    // Ensure modal replaces the 2 main boxes (Editor and Summary inspector)
    expect(output).not.toContain('CodeForge Configuration Editor');
    expect(output).not.toContain('Hooks Summary');
  });

  it('renders categorized preview when hooks field is active', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
    );

    // Navigate to hooks field:
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('Hooks Summary');
    expect(output).toContain('run.started: 1 hook [notify]');
    expect(output).toContain('run.completed: 1 hook [notify]');
    expect(output).toContain('outros: 0');
    expect(output).toContain('[Enter] Abrir Gerenciador de Hooks');
  });

  it('closes ConfigureHooksModal with Esc and returns to ConfigScreen', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
    );

    // Navigate to hooks field and open modal
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('\r');
    await tick();

    const modalOutput = lastFrame() ?? '';
    expect(modalOutput).toContain('Configuração de Hooks');
    expect(modalOutput).not.toContain('CodeForge Configuration Editor');

    // Press Esc to close
    stdin.write('\u001B');
    await tick();

    const closedOutput = lastFrame() ?? '';
    expect(closedOutput).not.toContain('Configuração de Hooks - Ciclo de Vida');
    expect(closedOutput).toContain('CodeForge Configuration Editor');
  });

  it('opens ConfigureHooksModal when Space is pressed on hooks field', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
    );

    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();

    stdin.write(' ');
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('Configuração de Hooks');
  });

  it('opens ConfigureHooksModal when Right Arrow is pressed on hooks field', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <ConfigScreen initialConfig={mockConfig} isInteractive={true} />
    );

    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();

    stdin.write('\u001B[C'); // Right arrow escape code
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('Configuração de Hooks');
  });

  it('updates hooks state without setting isDirty to true', async () => {
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
});
