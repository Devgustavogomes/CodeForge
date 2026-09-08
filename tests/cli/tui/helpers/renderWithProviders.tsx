import React, { ReactElement, ReactNode } from 'react';
import { render } from 'ink-testing-library';
import { ContainerProvider } from '../../../../src/cli/tui/context/ContainerContext.js';
import { NavigationProvider, TabId } from '../../../../src/cli/tui/context/NavigationContext.js';
import { ExecutionProvider } from '../../../../src/cli/tui/context/ExecutionContext.js';
import { AppContainer, createAppContainer, AppContainerDependencies } from '../../../../src/infrastructure/container.js';
import { InMemoryWorkspaceGateway } from '../../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../../helpers/in-memory-agent-runner.js';
import { TaskScheduler } from '../../../../src/scheduler/TaskScheduler.js';

export interface RenderWithProvidersOptions {
  container?: AppContainer;
  initialTab?: TabId;
  initialSpec?: string | null;
  initialActiveSpec?: string | null;
  scheduler?: TaskScheduler;
  autoStart?: boolean;
  maxLogLines?: number;
  flushIntervalMs?: number;
}

export function createMockContainer(overrides?: Partial<AppContainerDependencies>): AppContainer {
  const gw = new InMemoryWorkspaceGateway();
  const runner = new InMemoryAgentRunner();
  return createAppContainer(gw, {
    runnerProvider: () => runner,
    ...overrides,
  });
}

export interface TestProvidersProps {
  children: ReactNode;
  container?: AppContainer;
  initialTab?: TabId;
  initialSpec?: string | null;
  initialActiveSpec?: string | null;
  scheduler?: TaskScheduler;
  autoStart?: boolean;
  maxLogLines?: number;
  flushIntervalMs?: number;
}

export const TestProviders: React.FC<TestProvidersProps> = ({
  children,
  container,
  initialTab = 'specs',
  initialSpec,
  initialActiveSpec,
  scheduler,
  autoStart = false,
  maxLogLines,
  flushIntervalMs,
}) => {
  const resolvedContainer = container ?? createMockContainer();
  const spec = initialSpec ?? initialActiveSpec ?? undefined;

  return (
    <ContainerProvider container={resolvedContainer}>
      <NavigationProvider initialTab={initialTab}>
        <ExecutionProvider
          container={resolvedContainer}
          scheduler={scheduler}
          initialSpec={spec}
          autoStart={autoStart}
          maxLogLines={maxLogLines}
          flushIntervalMs={flushIntervalMs}
        >
          {children}
        </ExecutionProvider>
      </NavigationProvider>
    </ContainerProvider>
  );
};

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
) {
  const container = options.container ?? createMockContainer();

  const renderResult = render(
    <TestProviders {...options} container={container}>
      {ui}
    </TestProviders>,
  );

  return {
    ...renderResult,
    rerender: (newUi: ReactElement) =>
      renderResult.rerender(
        <TestProviders {...options} container={container}>
          {newUi}
        </TestProviders>,
      ),
    container,
  };
}
