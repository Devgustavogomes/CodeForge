import React, { ReactElement, ReactNode } from 'react';
import { render } from 'ink-testing-library';
import { ContainerProvider } from '../../../../src/cli/tui/context/ContainerContext.js';
import { ConfigProvider } from '../../../../src/cli/tui/context/ConfigContext.js';
import { NavigationProvider, TabId } from '../../../../src/cli/tui/context/NavigationContext.js';
import { ExecutionProvider } from '../../../../src/cli/tui/context/ExecutionContext.js';
import { PlanningProvider } from '../../../../src/cli/tui/context/PlanningContext.js';
import { AppContainer, createAppContainer, AppContainerDependencies } from '../../../../src/infrastructure/container.js';
import { InMemoryWorkspaceGateway } from '../../../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../../../helpers/in-memory-agent-runner.js';
import { TaskScheduler } from '../../../../src/scheduler/TaskScheduler.js';
import { PATHS } from '../../../../src/infrastructure/paths.js';
import { WorkspaceGateway } from '../../../../src/infrastructure/workspace.js';
export { flushAsync } from './flushAsync.js';


export interface RenderWithProvidersOptions {
  container?: AppContainer;
  initialTab?: TabId;
  initialIntent?: string | null;
  initialActiveIntent?: string | null;
  scheduler?: TaskScheduler;
  autoStart?: boolean;
  maxLogLines?: number;
  flushIntervalMs?: number;
}

export interface SetupWorkspaceConfigOverrides {
  environment?: string;
  plannerAgent?: string;
  executorAgent?: string;
  language?: string;
}

export function setupInitializedWorkspace(
  gw: WorkspaceGateway,
  configOverrides?: SetupWorkspaceConfigOverrides,
): void {
  gw.mkdir('.codeforge');
  gw.writeFile(
    PATHS.metadata,
    JSON.stringify(
      { initialized: true, version: '1.0', initializedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  const environment = configOverrides?.environment ?? 'local';
  const plannerAgent = configOverrides?.plannerAgent ?? 'default';
  const executorAgent = configOverrides?.executorAgent ?? 'default';
  const language = configOverrides?.language ?? 'en';

  gw.writeFile(
    PATHS.config,
    [
      'version: "1.0"',
      `environment: ${environment}`,
      `plannerAgent: ${plannerAgent}`,
      `executorAgent: ${executorAgent}`,
      `language: ${language}`,
    ].join('\n'),
  );
}

export function createMockContainer(overrides?: Partial<AppContainerDependencies>): AppContainer {
  const gw = new InMemoryWorkspaceGateway();
  const runner = new InMemoryAgentRunner();
  return createAppContainer(gw, {
    runnerProvider: () => runner,
    ...overrides,
  });
}

export function createInitializedContainer(
  overrides?: Partial<AppContainerDependencies>,
  configOverrides?: SetupWorkspaceConfigOverrides,
): AppContainer {
  const container = createMockContainer(overrides);
  setupInitializedWorkspace(container.gw, configOverrides);
  return container;
}

export interface TestProvidersProps {
  children: ReactNode;
  container?: AppContainer;
  initialTab?: TabId;
  initialIntent?: string | null;
  initialActiveIntent?: string | null;
  scheduler?: TaskScheduler;
  autoStart?: boolean;
  maxLogLines?: number;
  flushIntervalMs?: number;
}

export const TestProviders: React.FC<TestProvidersProps> = ({
  children,
  container,
  initialTab = 'intents',
  initialIntent,
  initialActiveIntent,
  scheduler,
  autoStart = false,
  maxLogLines,
  flushIntervalMs = 0,
}) => {
  const resolvedContainer = container ?? createMockContainer();
  const intent = initialIntent ?? initialActiveIntent ?? undefined;

  return (
    <ContainerProvider container={resolvedContainer}>
      <ConfigProvider>
        <NavigationProvider initialTab={initialTab}>
          <ExecutionProvider
            container={resolvedContainer}
            scheduler={scheduler}
            initialIntent={intent}
            autoStart={autoStart}
            maxLogLines={maxLogLines}
            flushIntervalMs={flushIntervalMs}
          >
            <PlanningProvider container={resolvedContainer}>
              {children}
            </PlanningProvider>
          </ExecutionProvider>
        </NavigationProvider>
      </ConfigProvider>
    </ContainerProvider>
  );
};

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
) {
  const container = options.container ?? createMockContainer();
  const flushIntervalMs = options.flushIntervalMs ?? 0;

  const renderResult = render(
    <TestProviders {...options} flushIntervalMs={flushIntervalMs} container={container}>
      {ui}
    </TestProviders>,
  );

  return {
    ...renderResult,
    rerender: (newUi: ReactElement) =>
      renderResult.rerender(
        <TestProviders {...options} flushIntervalMs={flushIntervalMs} container={container}>
          {newUi}
        </TestProviders>,
      ),
    container,
  };
}
