import React, { useEffect, useCallback, useMemo } from 'react';
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
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useTerminalDimensions } from './hooks/useTerminalDimensions.js';
import { AppContainer, createAppContainer } from '../../infrastructure/container.js';

export interface AppProps {
  container?: AppContainer;
  initialTab?: TabId;
  initialSpec?: string;
  autoStart?: boolean;
  onExit?: () => void;
  enableAlternateScreen?: boolean;
}

const QuitConfirmContent: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ onConfirm, onCancel }) => {
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
      <Text color="white">Are you sure you want to quit CodeForge?</Text>
      <Box justifyContent="space-between" marginTop={1}>
        <Text bold color="red">[y / Enter] Quit</Text>
        <Text dimColor>[n / Esc] Cancel</Text>
      </Box>
    </Box>
  );
};

const AppContent: React.FC<{
  container?: AppContainer;
  onExit?: () => void;
  enableAlternateScreen?: boolean;
}> = ({ container, onExit, enableAlternateScreen }) => {
  const nav = useNavigation();
  const exec = useExecution();
  const { statusNotification, clearStatusNotification } = usePlanning();
  const { exit } = useApp();
  const { rows } = useTerminalDimensions();

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

  const handleQuit = useCallback(() => {
    if (onExit) {
      onExit();
    }
    exit();
  }, [onExit, exit]);

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
  });

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
        borderColor="cyan"
        paddingX={1}
        width="100%"
      >
        <Header activeSpec={exec.activeSpec} borderStyle="none" />
        <TabBar activeTab={nav.activeTab} borderStyle="none" />
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
        hints={
          nav.activeTab === 'run' && exec.tasks.length === 0
            ? ['↑/↓: Navigate Specs', 'Enter: Start Run', 'c: Create Spec', '2: Specs Tab']
            : undefined
        }
      />

      {nav.modal?.type === 'quit_confirm' && (
        <Modal
          title="Exit CodeForge"
          isOpen={true}
          onClose={nav.closeModal}
          borderColor="red"
          width={50}
        >
          <QuitConfirmContent onConfirm={handleQuit} onCancel={nav.closeModal} />
        </Modal>
      )}

      {nav.modal && !['create_spec', 'pull_spec', 'quit_confirm'].includes(nav.modal.type) && (
        <Modal
          title={String(nav.modal.type).replace(/_/g, ' ').toUpperCase()}
          isOpen={true}
          onClose={nav.closeModal}
          borderColor="cyan"
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
            />
          </PlanningProvider>
        </ExecutionProvider>
      </NavigationProvider>
    </ContainerProvider>
  );
};
