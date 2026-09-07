import React from 'react';
import { Box, Text } from 'ink';
import { TaskScreenItem, STATUS_ICONS } from './TaskTree.js';

export interface TaskMetadataViewProps {
  selectedTask: TaskScreenItem | null;
  viewJson: boolean;
  feedback: {
    type: 'success' | 'error' | 'info';
    message: string;
  } | null;
  isSideBySide: boolean;
}

export const TaskMetadataView: React.FC<TaskMetadataViewProps> = ({
  selectedTask,
  viewJson,
  feedback,
  isSideBySide,
}) => {
  return (
    <Box
      flexDirection="column"
      width={isSideBySide ? '55%' : '100%'}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Box gap={1}>
          <Text bold color="cyan">
            Task Details: {selectedTask ? selectedTask.id : 'None'}
          </Text>
          {selectedTask && (
            <Text
              color={STATUS_ICONS[selectedTask.status]?.color ?? 'gray'}
              bold
            >
              {STATUS_ICONS[selectedTask.status]?.label ?? selectedTask.status}
            </Text>
          )}
        </Box>
        <Text dimColor>[v] {viewJson ? 'Formatted View' : 'JSON'}</Text>
      </Box>

      {feedback && (
        <Box
          marginY={1}
          paddingX={1}
          borderStyle="single"
          borderColor={feedback.type === 'success' ? 'green' : 'red'}
        >
          <Text color={feedback.type === 'success' ? 'green' : 'red'} bold>
            {feedback.message}
          </Text>
        </Box>
      )}

      {selectedTask ? (
        viewJson ? (
          <Box flexDirection="column">
            <Text color="gray">
              {JSON.stringify(selectedTask, null, 2)}
            </Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Box marginBottom={0}>
              <Text bold>Title: </Text>
              <Text color="white" wrap="truncate-end">
                {selectedTask.title}
              </Text>
            </Box>

            {selectedTask.objective && (
              <Box marginBottom={0}>
                <Text bold>Objective: </Text>
                <Text dimColor wrap="truncate-end">
                  {selectedTask.objective}
                </Text>
              </Box>
            )}

            <Box marginBottom={0} justifyContent="space-between">
              <Box gap={1} flexShrink={1}>
                <Text bold>Deps: </Text>
                <Text dimColor wrap="truncate-end">
                  {selectedTask.dependencies.length > 0
                    ? selectedTask.dependencies.join(', ')
                    : 'None (Root)'}
                </Text>
              </Box>
              {selectedTask.files && selectedTask.files.length > 0 && (
                <Box gap={1} flexShrink={1} paddingLeft={1}>
                  <Text bold>Files: </Text>
                  <Text dimColor wrap="truncate-end">
                    {selectedTask.files.join(', ')}
                  </Text>
                </Box>
              )}
            </Box>

            {selectedTask.context && (
              <Box marginBottom={0}>
                <Text bold>Context: </Text>
                <Text dimColor wrap="truncate-end">
                  {selectedTask.context}
                </Text>
              </Box>
            )}

            {selectedTask.constraints && selectedTask.constraints.length > 0 && (
              <Box marginBottom={0}>
                <Text bold>Constraints: </Text>
                <Text dimColor wrap="truncate-end">
                  {selectedTask.constraints.join(', ')}
                </Text>
              </Box>
            )}

            {selectedTask.acceptanceCriteria && selectedTask.acceptanceCriteria.length > 0 && (
              <Box marginBottom={0}>
                <Text bold>Acceptance: </Text>
                <Text dimColor wrap="truncate-end">
                  {selectedTask.acceptanceCriteria.join(', ')}
                </Text>
              </Box>
            )}

            {selectedTask.errors && selectedTask.errors.length > 0 && (
              <Box marginBottom={0}>
                <Text color="red" bold wrap="truncate-end">
                  ✗ Error: {selectedTask.errors[0]}
                </Text>
              </Box>
            )}

            <Box
              marginTop={1}
              borderStyle="single"
              borderColor="gray"
              paddingX={1}
              justifyContent="space-between"
            >
              <Text dimColor>
                [c] Mark Completed · [r] Retry · [x] Reset Status
              </Text>
            </Box>
          </Box>
        )
      ) : (
        <Box paddingY={2} justifyContent="center">
          <Text dimColor>
            Select a task to inspect details and dependency graph.
          </Text>
        </Box>
      )}
    </Box>
  );
};
