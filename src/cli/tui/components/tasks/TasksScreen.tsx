import React from 'react';
import { Box } from 'ink';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { AppContainer } from '../../../../infrastructure/container.js';
import { TaskScreenItem, TaskTree } from './components/TaskTree.js';
import { TaskMetadataView } from './components/TaskMetadataView.js';
import { useTasksScreen } from './hooks/useTasksScreen.js';
import { useTasksHotkeys } from './hooks/useTasksHotkeys.js';

export type { TaskScreenItem };

export interface TasksScreenProps {
  container?: AppContainer;
  initialSpec?: string;
  initialTasks?: TaskScreenItem[];
  onCompleteTask?: (taskId: string) => void;
  onRetryTask?: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
  isInteractive?: boolean;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({
  container,
  initialSpec,
  initialTasks,
  onCompleteTask,
  onRetryTask,
  onResetTask,
  isInteractive = true,
}) => {
  const { breakpoint } = useTerminalDimensions();
  const screenState = useTasksScreen({
    container,
    initialSpec,
    initialTasks,
    onCompleteTask,
    onRetryTask,
    onResetTask,
  });

  useTasksHotkeys({
    isInteractive,
    onNextTask: screenState.handleNextTask,
    onPrevTask: screenState.handlePrevTask,
    onNextSpec: screenState.handleNextSpec,
    onPrevSpec: screenState.handlePrevSpec,
    onToggleViewJson: screenState.handleToggleViewJson,
    onComplete: screenState.handleComplete,
    onRetry: screenState.handleRetry,
    onReset: screenState.handleReset,
  });

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
        />
        <TaskMetadataView
          selectedTask={screenState.selectedTask}
          viewJson={screenState.viewJson}
          feedback={screenState.feedback}
          isSideBySide={isSideBySide}
        />
      </Box>
    </Box>
  );
};
