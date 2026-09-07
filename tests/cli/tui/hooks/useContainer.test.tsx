import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { ContainerProvider } from '../../../../src/cli/tui/context/ContainerContext.js';
import { useContainer } from '../../../../src/cli/tui/hooks/useContainer.js';
import { AppContainer, createAppContainer } from '../../../../src/infrastructure/container.js';
import { InMemoryWorkspaceGateway } from '../../../helpers/in-memory-workspace.js';

describe('useContainer hook', () => {
  it('throws a descriptive error when used outside ContainerProvider', () => {
    let capturedError: Error | null = null;

    const TestConsumer: React.FC = () => {
      try {
        useContainer();
      } catch (err) {
        capturedError = err as Error;
      }
      return <Text>Consumer</Text>;
    };

    render(<TestConsumer />);

    expect(capturedError).not.toBeNull();
    expect(capturedError?.message).toBe(
      'useContainer must be used within a ContainerProvider',
    );
  });

  it('provides the AppContainer when wrapped in ContainerProvider', () => {
    const gw = new InMemoryWorkspaceGateway();
    const container = createAppContainer(gw);
    let resolvedContainer: AppContainer | null = null;

    const TestConsumer: React.FC = () => {
      resolvedContainer = useContainer();
      return <Text>Consumer</Text>;
    };

    render(
      <ContainerProvider container={container}>
        <TestConsumer />
      </ContainerProvider>,
    );

    expect(resolvedContainer).not.toBeNull();
    expect(resolvedContainer).toBe(container);
    expect(resolvedContainer?.workspaceGateway).toBe(gw);
  });
});
