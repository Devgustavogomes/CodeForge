import React from 'react';
import { Box, useInput } from 'ink';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { AppContainer } from '../../../../infrastructure/container.js';
import { TaskScreenItem, TaskTree } from './components/TaskTree.js';
import { TaskMetadataView } from './components/TaskMetadataView.js';
import { ViewTaskModal } from './ViewTaskModal.js';
import { useTasksScreen } from './hooks/useTasksScreen.js';
import { useTasksHotkeys } from './hooks/useTasksHotkeys.js';
import { TasksActionFeedback } from './hooks/useTasksScreen.js';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal.js';
import { SupportedLanguage } from '../../../../config/types.js';
import { translate } from '../../../ui/i18n.js';

export type { TaskScreenItem };

export interface TasksScreenProps {
  container?: AppContainer;
  initialIntent?: string;
  initialTasks?: TaskScreenItem[];
  onCompleteTask?: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
  onFeedback?: (feedback: TasksActionFeedback) => void;
  onNotification?: (
    message: string,
    type?: 'success' | 'error' | 'info',
  ) => void;
  language?: SupportedLanguage;
  isInteractive?: boolean;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({
  container,
  initialIntent,
  initialTasks,
  onCompleteTask,
  onResetTask,
  onFeedback,
  onNotification,
  language,
  isInteractive = true,
}) => {
  const { breakpoint } = useTerminalDimensions();
  const screenState = useTasksScreen({
    container,
    initialIntent,
    initialTasks,
    onCompleteTask,
    onResetTask,
    onFeedback,
    onNotification,
    language,
  });

  useTasksHotkeys({
    isInteractive,
    isModalOpen:
      screenState.isViewTaskModalOpen || screenState.isDeleteTaskModalOpen,
    isSearchingIntent: screenState.isSearchingIntent,
    isTextInputActive: screenState.isTextInputActive,
    hasSelectedTask: screenState.selectedTask !== null,
    onOpenTask: screenState.handleOpenViewTaskModal,
    onOpenDeleteModal: screenState.handleOpenDeleteTaskModal,
    onNextTask: screenState.handleNextTask,
    onPrevTask: screenState.handlePrevTask,
    onNextIntent: screenState.handleNextIntent,
    onPrevIntent: screenState.handlePrevIntent,
    onToggleViewJson: screenState.handleToggleViewJson,
    onToggleExpand: screenState.handleToggleExpand,
    onComplete: screenState.handleComplete,
    onReset: screenState.handleReset,
    onStartSearch: screenState.handleStartSearchIntent,
  });

  // Dedicated input capture when intent search is active
  useInput(
    (input, key) => {
      if (!isInteractive || !screenState.isSearchingIntent) return;

      // Escape: dismiss search & clear
      if (key.escape || input === '\u001B') {
        screenState.handleClearSearchIntent();
        return;
      }

      // Enter: finish search but keep filtered selection
      if (key.return || input === '\r' || input === '\n') {
        screenState.handleStopSearchIntent();
        return;
      }

      // Backspace / Delete
      if (key.backspace || key.delete || input === '\x08' || input === '\x7f') {
        screenState.setIntentSearchQuery((prev) => prev.slice(0, -1));
        return;
      }

      // Ctrl+U: clear query
      if (key.ctrl && input === 'u') {
        screenState.setIntentSearchQuery('');
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
          screenState.setIntentSearchQuery((prev) => prev + printable);
        }
      }
    },
    {
      isActive:
        isInteractive &&
        screenState.isSearchingIntent &&
        !screenState.isViewTaskModalOpen &&
        !screenState.isDeleteTaskModalOpen,
    },
  );

  if (screenState.isViewTaskModalOpen && screenState.selectedTask) {
    return (
      <ViewTaskModal
        task={screenState.selectedTask}
        intentName={screenState.currentIntent}
        currentIntent={screenState.currentIntent}
        isOpen={true}
        onClose={screenState.handleCloseViewTaskModal}
      />
    );
  }

  if (screenState.isDeleteTaskModalOpen && screenState.selectedTask) {
    return (
      <ConfirmDeleteModal
        title={translate('tui_task_delete_title', screenState.language)}
        body={translate('tui_task_delete_body', screenState.language)}
        detail={translate('tui_task_delete_detail', screenState.language, {
          taskId: screenState.selectedTask.id,
          title: screenState.selectedTask.title,
        })}
        warning={translate('tui_task_delete_warning', screenState.language)}
        onConfirm={screenState.handleConfirmDeleteTask}
        onCancel={screenState.handleCancelDeleteTask}
        language={screenState.language}
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
          intents={screenState.intents}
          selectedIntentIndex={screenState.selectedIntentIndex}
          currentIntent={screenState.currentIntent}
          isSideBySide={isSideBySide}
          isSearchingIntent={screenState.isSearchingIntent}
          intentSearchQuery={screenState.intentSearchQuery}
          onSearchChange={screenState.setIntentSearchQuery}
          onSearchSubmit={screenState.handleStopSearchIntent}
          onSearchCancel={screenState.handleClearSearchIntent}
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
