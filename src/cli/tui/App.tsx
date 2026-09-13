import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { ContainerProvider } from './context/ContainerContext.js';
import { NavigationProvider, useNavigation, TabId } from './context/NavigationContext.js';
import { ExecutionProvider, useExecution } from './context/ExecutionContext.js';
import { PlanningProvider, usePlanning } from './context/PlanningContext.js';
import { Header } from './components/common/Header.js';
import { TabBar } from './components/common/TabBar.js';
import { StatusBar } from './components/common/StatusBar.js';
import { Modal } from './components/common/Modal.js';
import { RunDashboard } from './components/run/RunDashboard.js';
import { SpecsScreen } from './components/specs/SpecsScreen.js';
import { CreateSpecModal } from './components/specs/CreateSpecModal.js';
import { PullSpecModal } from './components/specs/PullSpecModal.js';
import { TasksScreen } from './components/tasks/TasksScreen.js';
import { DocsScreen } from './components/docs/DocsScreen.js';
import { ConfigScreen } from './components/config/ConfigScreen.js';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useTerminalDimensions } from './hooks/useTerminalDimensions.js';
import { AppContainer, createAppContainer } from '../../infrastructure/container.js';
import { PATHS } from '../../infrastructure/paths.js';
import { theme } from './theme.js';
import { translate } from '../ui/i18n.js';
import { SupportedLanguage } from '../../config/types.js';

export interface AppProps {
  container?: AppContainer;
  initialTab?: TabId;
  initialSpec?: string;
  autoStart?: boolean;
  onExit?: () => void;
  enableAlternateScreen?: boolean;
  language?: SupportedLanguage;
}

const QuitConfirmContent: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
  language?: SupportedLanguage;
}> = ({ onConfirm, onCancel, language = 'en' }) => {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y' || key.return) {
      onConfirm();
      return;
    }
    if (input === 'n' || input === 'N' || key.escape) {
      onCancel();
      return;
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="white">{translate('tui_quit_confirm_message', language)}</Text>
      <Box justifyContent="space-between" marginTop={1}>
        <Text bold color={theme.colors.error}>
          {translate('tui_quit_confirm_yes', language)}
        </Text>
        <Text dimColor>
          {translate('tui_quit_confirm_no', language)}
        </Text>
      </Box>
    </Box>
  );
};

export function isWorkspaceInitialized(appContainer?: AppContainer): boolean {
  if (!appContainer) return false;
  try {
    const gw = appContainer.workspaceGateway ?? appContainer.gw;
    if (!gw || !gw.exists(PATHS.metadata)) {
      return false;
    }
    const rawMetadata = gw.readFile(PATHS.metadata);
    const parsedMetadata = JSON.parse(rawMetadata);
    if (!parsedMetadata || parsedMetadata.initialized !== true) {
      return false;
    }

    const config = appContainer.configService?.loadConfig();
    if (!config) {
      return false;
    }

    const hasEnvironment =
      typeof config.environment === 'string' && config.environment.trim().length > 0;
    const hasPlanner =
      typeof config.plannerAgent === 'string' && config.plannerAgent.trim().length > 0;
    const hasExecutor =
      typeof config.executorAgent === 'string' && config.executorAgent.trim().length > 0;

    return hasEnvironment && hasPlanner && hasExecutor;
  } catch {
    return false;
  }
}

const AppContent: React.FC<{
  container?: AppContainer;
  onExit?: () => void;
  enableAlternateScreen?: boolean;
  initialTab?: TabId;
  language?: SupportedLanguage;
}> = ({ container, onExit, enableAlternateScreen, initialTab, language: propLanguage }) => {
  const nav = useNavigation();
  const exec = useExecution();
  const { statusNotification, clearStatusNotification } = usePlanning();
  const { exit } = useApp();
  const { rows } = useTerminalDimensions();

  const isInitialized = useMemo(() => isWorkspaceInitialized(container), [container]);
  const [isOnboardingActive, setIsOnboardingActive] = useState(!isInitialized);

  const [activeLanguage, setActiveLanguage] = useState<SupportedLanguage>(() => {
    if (propLanguage) return propLanguage;
    try {
      return container?.configService?.loadConfig?.()?.language ?? 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    if (propLanguage) {
      setActiveLanguage(propLanguage);
    }
  }, [propLanguage]);

  const handleQuit = useCallback(() => {
    if (onExit) {
      onExit();
    }
    exit();
  }, [onExit, exit]);

  const handleOnboardingComplete = useCallback(() => {
    setIsOnboardingActive(false);
    try {
      const lang = container?.configService?.loadConfig?.()?.language ?? 'en';
      setActiveLanguage(lang);
    } catch {
      // Keep existing language
    }
    nav.setActiveTab(initialTab === 'run' ? 'run' : 'specs');
  }, [container, initialTab, nav]);

  // Clear active notifications when switching tabs
  useEffect(() => {
    clearStatusNotification();
  }, [nav.activeTab, clearStatusNotification]);

  // Manage full-screen alternative screen buffer switching and terminal cleanup
  useEffect(() => {
    if (enableAlternateScreen && process.stdout?.isTTY) {
      process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H');
      const restore = () => {
        process.stdout.write('\x1b[?25h\x1b[?1049l');
      };
      process.on('exit', restore);
      return () => {
        process.off('exit', restore);
        restore();
      };
    }
  }, [enableAlternateScreen]);

  // Clean signal handling on unmount / interruption
  useEffect(() => {
    const handleSignal = () => {
      handleQuit();
    };
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);
    return () => {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
    };
  }, [handleQuit]);

  // Global keyboard shortcuts (arrows reserved for inside-screen navigation)
  useKeyboardShortcuts({
    onQuit: handleQuit,
    enableArrowNav: false,
    isActive: !isOnboardingActive,
  });

  if (isOnboardingActive && container) {
    return (
      <Box
        flexDirection="column"
        width="100%"
        minHeight={rows > 2 ? rows - 1 : undefined}
      >
        <OnboardingWizard
          container={container}
          onComplete={handleOnboardingComplete}
          onExit={handleQuit}
        />
      </Box>
    );
  }

  const isInteractive = nav.modal === null;

  return (
    <Box
      flexDirection="column"
      width="100%"
      height={rows > 2 ? rows - 1 : undefined}
      overflow="hidden"
    >
      {/* Unified top navigation bar */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
        width="100%"
      >
        <Header activeSpec={exec.activeSpec} borderStyle="none" language={activeLanguage} />
        <TabBar activeTab={nav.activeTab} borderStyle="none" language={activeLanguage} />
      </Box>

      {/* Active Tab Screen */}
      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        {nav.modal?.type === 'create_spec' ? (
          <CreateSpecModal
            isOpen={true}
            container={container}
            onClose={nav.closeModal}
            width="100%"
            onSuccess={(specName) => {
              nav.closeModal();
              exec.setActiveSpec(specName);
              nav.setActiveTab('specs');
            }}
          />
        ) : nav.modal?.type === 'pull_spec' ? (
          <PullSpecModal
            isOpen={true}
            container={container}
            onClose={nav.closeModal}
            width="100%"
            onSuccess={(specName) => {
              nav.closeModal();
              exec.setActiveSpec(specName);
              nav.setActiveTab('specs');
            }}
          />
        ) : (
          <>
            {nav.activeTab === 'run' && <RunDashboard isInteractive={isInteractive} />}
            {nav.activeTab === 'specs' && <SpecsScreen container={container} isInteractive={isInteractive} />}
            {nav.activeTab === 'tasks' && <TasksScreen container={container} isInteractive={isInteractive} />}
            {nav.activeTab === 'docs' && <DocsScreen container={container} isInteractive={isInteractive} />}
            {nav.activeTab === 'config' && <ConfigScreen container={container} isInteractive={isInteractive} />}
          </>
        )}
      </Box>

      {/* Status bar */}
      <StatusBar
        activeTab={nav.activeTab}
        borderStyle="none"
        status={statusNotification || undefined}
        language={activeLanguage}
        hints={
          nav.activeTab === 'run' && exec.tasks.length === 0
            ? translate('tui_status_hints_run_empty', activeLanguage)
            : undefined
        }
      />

      {nav.modal?.type === 'quit_confirm' && (
        <Modal
          title={translate('tui_modal_quit_confirm', activeLanguage)}
          isOpen={true}
          onClose={nav.closeModal}
          borderColor={theme.colors.error}
          width={50}
        >
          <QuitConfirmContent
            onConfirm={handleQuit}
            onCancel={nav.closeModal}
            language={activeLanguage}
          />
        </Modal>
      )}

      {nav.modal && !['create_spec', 'pull_spec', 'quit_confirm'].includes(nav.modal.type) && (
        <Modal
          title={String(nav.modal.type).replace(/_/g, ' ').toUpperCase()}
          isOpen={true}
          onClose={nav.closeModal}
          borderColor={theme.colors.primary}
          width={54}
        >
          <Box flexDirection="column" paddingY={1}>
            <Text color="white">Action: {nav.modal.type}</Text>
            {Boolean(nav.modal.props) && (
              <Text dimColor>{JSON.stringify(nav.modal.props)}</Text>
            )}
            <Box marginTop={1}>
              <Text dimColor>[Esc] Close</Text>
            </Box>
          </Box>
        </Modal>
      )}
    </Box>
  );
};

export const App: React.FC<AppProps> = ({
  container,
  initialTab = 'specs',
  initialSpec,
  autoStart = false,
  onExit,
  enableAlternateScreen = false,
  language,
}) => {
  const appContainer = useMemo(() => container ?? createAppContainer(), [container]);

  return (
    <ContainerProvider container={appContainer}>
      <NavigationProvider initialTab={initialTab}>
        <ExecutionProvider container={appContainer} initialSpec={initialSpec} autoStart={autoStart}>
          <PlanningProvider container={appContainer}>
            <AppContent
              container={appContainer}
              onExit={onExit}
              enableAlternateScreen={enableAlternateScreen}
              initialTab={initialTab}
              language={language}
            />
          </PlanningProvider>
        </ExecutionProvider>
      </NavigationProvider>
    </ContainerProvider>
  );
};
