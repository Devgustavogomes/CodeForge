import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../../theme.js';
import { TaskScreenItem, STATUS_ICONS } from './TaskTree.js';

export interface TaskMetadataViewProps {
  selectedTask: TaskScreenItem | null;
  viewJson: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  feedback: {
    type: 'success' | 'error' | 'info';
    message: string;
  } | null;
  isSideBySide: boolean;
}

export const TaskMetadataView: React.FC<TaskMetadataViewProps> = ({
  selectedTask,
  viewJson,
  isExpanded = false,
  onToggleExpand: _onToggleExpand,
  feedback,
  isSideBySide,
}) => {
  return (
    <Box
      flexDirection="column"
      width={isSideBySide ? '55%' : '100%'}
      borderStyle="round"
      borderColor={theme.colors.borderSubtle}
      paddingX={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Box gap={1} flexShrink={1}>
          <Text bold color={theme.colors.primary}>
            Task: {selectedTask ? selectedTask.id : 'None'}
          </Text>
          {selectedTask && (
            <Text
              color={STATUS_ICONS[selectedTask.status]?.color ?? theme.colors.muted}
              bold
            >
              {STATUS_ICONS[selectedTask.status]?.label ?? selectedTask.status}
            </Text>
          )}
        </Box>
        <Box gap={1} flexShrink={0}>
          <Text color={theme.colors.muted}>[e] {isExpanded ? 'Collapse' : 'Expand'}</Text>
          <Text color={theme.colors.muted}>[v] {viewJson ? 'Formatted' : 'JSON'}</Text>
        </Box>
      </Box>

      {feedback && (
        <Box
          marginY={1}
          paddingX={1}
          borderStyle="single"
          borderColor={
            feedback.type === 'success'
              ? theme.colors.success
              : feedback.type === 'error'
                ? theme.colors.error
                : theme.colors.warning
          }
        >
          <Text
            color={
              feedback.type === 'success'
                ? theme.colors.success
                : feedback.type === 'error'
                  ? theme.colors.error
                  : theme.colors.warning
            }
            bold
          >
            {feedback.message}
          </Text>
        </Box>
      )}

      {selectedTask ? (
        viewJson ? (
          <Box flexDirection="column">
            <Text color={theme.colors.muted}>
              {JSON.stringify(selectedTask, null, 2)}
            </Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Box marginBottom={0}>
              <Text bold>Title: </Text>
              <Text color={theme.colors.text} wrap={isExpanded ? 'wrap' : 'truncate-end'}>
                {selectedTask.title}
              </Text>
            </Box>

            {selectedTask.objective && (
              <Box marginBottom={0} flexDirection={isExpanded ? 'column' : 'row'}>
                <Text bold>Objective: </Text>
                <Text color={theme.colors.muted} wrap={isExpanded ? 'wrap' : 'truncate-end'}>
                  {selectedTask.objective}
                </Text>
              </Box>
            )}

            <Box marginBottom={0} flexDirection={isExpanded ? 'column' : 'row'}>
              <Text bold>Deps: </Text>
              <Text color={theme.colors.muted} wrap={isExpanded ? 'wrap' : 'truncate-end'}>
                {selectedTask.dependencies.length > 0
                  ? selectedTask.dependencies.join(', ')
                  : 'None (Root)'}
              </Text>
            </Box>

            {selectedTask.files && selectedTask.files.length > 0 && (
              <Box marginBottom={0} flexDirection={isExpanded ? 'column' : 'row'}>
                <Text bold>Files: </Text>
                <Text color={theme.colors.muted} wrap={isExpanded ? 'wrap' : 'truncate-end'}>
                  {selectedTask.files.join(', ')}
                </Text>
              </Box>
            )}

            {selectedTask.context && (
              <Box marginBottom={0} flexDirection={isExpanded ? 'column' : 'row'}>
                <Text bold>Context: </Text>
                <Text color={theme.colors.muted} wrap={isExpanded ? 'wrap' : 'truncate-end'}>
                  {selectedTask.context}
                </Text>
              </Box>
            )}

            {isExpanded && selectedTask.constraints && selectedTask.constraints.length > 0 && (
              <Box marginBottom={0} flexDirection="column">
                <Text bold>Constraints: </Text>
                <Text color={theme.colors.muted} wrap="wrap">
                  {selectedTask.constraints.join(', ')}
                </Text>
              </Box>
            )}

            {isExpanded && selectedTask.acceptanceCriteria && selectedTask.acceptanceCriteria.length > 0 && (
              <Box marginBottom={0} flexDirection="column">
                <Text bold>Acceptance: </Text>
                <Text color={theme.colors.muted} wrap="wrap">
                  {selectedTask.acceptanceCriteria.join(', ')}
                </Text>
              </Box>
            )}

            {selectedTask.errors && selectedTask.errors.length > 0 && (
              <Box marginBottom={0} flexDirection="column">
                <Text color={theme.colors.error} bold wrap={isExpanded ? 'wrap' : 'truncate-end'}>
                  ✗ Error: {selectedTask.errors[0]}
                </Text>
              </Box>
            )}

            <Box
              marginTop={1}
              borderStyle="single"
              borderColor={theme.colors.borderSubtle}
              paddingX={1}
              justifyContent="space-between"
            >
              <Text color={theme.colors.muted}>
                [c] Complete · [x] Reset · [e] {isExpanded ? 'Collapse' : 'Expand All'}
              </Text>
            </Box>
          </Box>
        )
      ) : (
        <Box paddingY={2} justifyContent="center">
          <Text color={theme.colors.muted}>
            Select a task to inspect details and dependency graph.
          </Text>
        </Box>
      )}
    </Box>
  );
};
