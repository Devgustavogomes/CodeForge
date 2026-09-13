import React from 'react';
import { Box, useInput } from 'ink';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { AppContainer } from '../../../../infrastructure/container.js';
import { TaskScreenItem, TaskTree } from './components/TaskTree.js';
import { TaskMetadataView } from './components/TaskMetadataView.js';
import { ViewTaskModal } from './ViewTaskModal.js';
import { useTasksScreen } from './hooks/useTasksScreen.js';
import { useTasksHotkeys } from './hooks/useTasksHotkeys.js';

export type { TaskScreenItem };

export interface TasksScreenProps {
  container?: AppContainer;
  initialSpec?: string;
  initialTasks?: TaskScreenItem[];
  onCompleteTask?: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
  isInteractive?: boolean;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({
  container,
  initialSpec,
  initialTasks,
  onCompleteTask,
  onResetTask,
  isInteractive = true,
}) => {
  const { breakpoint } = useTerminalDimensions();
  const screenState = useTasksScreen({
    container,
    initialSpec,
    initialTasks,
    onCompleteTask,
    onResetTask,
  });

  useTasksHotkeys({
    isInteractive,
    isModalOpen: screenState.isViewTaskModalOpen,
    isSearchingSpec: screenState.isSearchingSpec,
    onOpenTask: screenState.handleOpenViewTaskModal,
    onNextTask: screenState.handleNextTask,
    onPrevTask: screenState.handlePrevTask,
    onNextSpec: screenState.handleNextSpec,
    onPrevSpec: screenState.handlePrevSpec,
    onToggleViewJson: screenState.handleToggleViewJson,
    onToggleExpand: screenState.handleToggleExpand,
    onComplete: screenState.handleComplete,
    onReset: screenState.handleReset,
    onStartSearch: screenState.handleStartSearchSpec,
  });

  // Dedicated input capture when spec search is active
  useInput(
    (input, key) => {
      if (!isInteractive || !screenState.isSearchingSpec) return;

      // Escape: dismiss search & clear
      if (key.escape || input === '\u001B') {
        screenState.handleClearSearchSpec();
        return;
      }

      // Enter: finish search but keep filtered selection
      if (key.return || input === '\r' || input === '\n') {
        screenState.handleStopSearchSpec();
        return;
      }

      // Backspace / Delete
      if (key.backspace || key.delete || input === '\x08' || input === '\x7f') {
        screenState.setSpecSearchQuery((prev) => prev.slice(0, -1));
        return;
      }

      // Ctrl+U: clear query
      if (key.ctrl && input === 'u') {
        screenState.setSpecSearchQuery('');
        return;
      }

      // Printable characters
      if (!key.ctrl && !key.meta) {
        const printable = input
          .split('')
          .filter((ch) => {
            const code = ch.charCodeAt(0);
            return (code >= 32 && code !== 127) || code > 127;
          })
          .join('');

        if (printable.length > 0) {
          screenState.setSpecSearchQuery((prev) => prev + printable);
        }
      }
    },
    { isActive: isInteractive && screenState.isSearchingSpec && !screenState.isViewTaskModalOpen },
  );

  if (screenState.isViewTaskModalOpen && screenState.selectedTask) {
    return (
      <ViewTaskModal
        task={screenState.selectedTask}
        specName={screenState.currentSpec}
        currentSpec={screenState.currentSpec}
        isOpen={true}
        onClose={screenState.handleCloseViewTaskModal}
      />
    );
  }

  const isSideBySide = breakpoint !== 'minimal';

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      <Box
        flexDirection={isSideBySide ? 'row' : 'column'}
        width="100%"
        flexGrow={1}
      >
        <TaskTree
          tasks={screenState.tasks}
          visibleTasks={screenState.visibleTasks}
          selectedTaskId={screenState.selectedTask?.id ?? null}
          specs={screenState.specs}
          selectedSpecIndex={screenState.selectedSpecIndex}
          currentSpec={screenState.currentSpec}
          isSideBySide={isSideBySide}
          isSearchingSpec={screenState.isSearchingSpec}
          specSearchQuery={screenState.specSearchQuery}
          onSearchChange={screenState.setSpecSearchQuery}
          onSearchSubmit={screenState.handleStopSearchSpec}
          onSearchCancel={screenState.handleClearSearchSpec}
        />
        <TaskMetadataView
          selectedTask={screenState.selectedTask}
          viewJson={screenState.viewJson}
          isExpanded={screenState.isExpanded}
          onToggleExpand={screenState.handleToggleExpand}
          feedback={screenState.feedback}
          isSideBySide={isSideBySide}
        />
      </Box>
    </Box>
  );
};
