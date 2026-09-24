import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  ConfigProvider,
  DEFAULT_TUI_CONFIG,
  useConfig,
} from '../../../../src/cli/tui/context/ConfigContext.js';
import { ContainerProvider } from '../../../../src/cli/tui/context/ContainerContext.js';
import { createAppContainer } from '../../../../src/infrastructure/container.js';
import { InMemoryWorkspaceGateway } from '../../../helpers/in-memory-workspace.js';

describe('ConfigProvider', () => {
  function renderConfig(gw: InMemoryWorkspaceGateway) {
    const container = createAppContainer(gw);
    let current!: ReturnType<typeof useConfig>;
    const Consumer = () => {
      current = useConfig();
      return <Text>Language: {current.config.language}</Text>;
    };

    const rendered = render(
      <ContainerProvider container={container}>
        <ConfigProvider>
          <Consumer />
        </ConfigProvider>
      </ContainerProvider>,
    );
    return { ...rendered, get current() { return current; } };
  }

  it('publishes the configuration loaded from the isolated workspace', () => {
    const gw = new InMemoryWorkspaceGateway({
      '.codeforge/config.yaml': 'language: es\nenvironment: local\nplannerAgent: planner\nexecutorAgent: executor\n',
    });
    const view = renderConfig(gw);

    expect(view.current.config.language).toBe('es');
    expect(view.lastFrame()).toContain('Language: es');
    view.unmount();
  });

  it('publishes updateConfig values to consumers', async () => {
    const view = renderConfig(new InMemoryWorkspaceGateway());
    const updated = { ...DEFAULT_TUI_CONFIG, language: 'pt' as const };

    view.current.updateConfig(updated);

    await vi.waitFor(() => {
      expect(view.current.config.language).toBe('pt');
      expect(view.lastFrame()).toContain('Language: pt');
    });
    view.unmount();
  });

  it('reloads and publishes a configuration changed on disk', async () => {
    const gw = new InMemoryWorkspaceGateway({
      '.codeforge/config.yaml': 'language: en\nenvironment: local\nplannerAgent: planner\nexecutorAgent: executor\n',
    });
    const view = renderConfig(gw);

    gw.writeFile(
      '.codeforge/config.yaml',
      'language: es\nenvironment: local\nplannerAgent: planner\nexecutorAgent: executor\n',
    );
    view.current.reloadConfig();

    await vi.waitFor(() => {
      expect(view.current.config.language).toBe('es');
      expect(view.lastFrame()).toContain('Language: es');
    });
    view.unmount();
  });

  it('uses the TUI defaults when no configuration exists', () => {
    const view = renderConfig(new InMemoryWorkspaceGateway());

    expect(view.current.config).toEqual(DEFAULT_TUI_CONFIG);
    expect(view.lastFrame()).toContain(`Language: ${DEFAULT_TUI_CONFIG.language}`);
    view.unmount();
  });
});
