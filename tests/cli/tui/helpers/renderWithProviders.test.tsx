import React from 'react';
import { describe, it, expect } from 'vitest';
import { Text } from 'ink';
import { renderWithProviders, createMockContainer } from './renderWithProviders.js';
import { useContainer } from '../../../../src/cli/tui/hooks/useContainer.js';
import { useNavigation } from '../../../../src/cli/tui/context/NavigationContext.js';
import { useExecution } from '../../../../src/cli/tui/context/ExecutionContext.js';
import { InMemoryWorkspaceGateway } from '../../../helpers/in-memory-workspace.js';

describe('renderWithProviders helper', () => {
  it('wraps rendered component with ContainerProvider, NavigationProvider, and ExecutionProvider', () => {
    let capturedContainer = false;
    let capturedTab = '';
    let capturedSpec: string | null = null;

    const TestComponent: React.FC = () => {
      const container = useContainer();
      const nav = useNavigation();
      const exec = useExecution();

      capturedContainer = Boolean(container);
      capturedTab = nav.activeTab;
      capturedSpec = exec.activeSpec;

      return <Text>Rendered with all providers</Text>;
    };

    const { lastFrame, container } = renderWithProviders(<TestComponent />, {
      initialTab: 'config',
      initialSpec: 'sample-spec',
    });

    expect(lastFrame()).toContain('Rendered with all providers');
    expect(capturedContainer).toBe(true);
    expect(capturedTab).toBe('config');
    expect(capturedSpec).toBe('sample-spec');
    expect(container).toBeDefined();
  });

  it('allows passing custom AppContainer instance', () => {
    const customGw = new InMemoryWorkspaceGateway({ 'custom.txt': 'hello' });
    const customContainer = createMockContainer({ workspaceGateway: customGw });

    let containerFromHook: unknown = null;

    const TestComponent: React.FC = () => {
      containerFromHook = useContainer();
      return <Text>Custom Container</Text>;
    };

    const { container } = renderWithProviders(<TestComponent />, {
      container: customContainer,
    });

    expect(container).toBe(customContainer);
    expect(containerFromHook).toBe(customContainer);
  });
});
