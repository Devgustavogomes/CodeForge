import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../../theme.js';
import { IntentItemWithStats, STATUS_BADGE_MAP } from './IntentList.js';

export interface IntentDetailsProps {
  intent?: IntentItemWithStats | null;  isSideBySide?: boolean;
  isValidating?: boolean;
  actionFeedback?: { type: 'info' | 'success' | 'error'; message: string } | null;
  validationErrors?: string[] | null;
  children?: React.ReactNode;
}

export const IntentDetails: React.FC<IntentDetailsProps> = memo(({
  intent: propIntent,
    isSideBySide = true,
  isValidating = false,
  actionFeedback,
  validationErrors,
  children,
}) => {
  const intent = propIntent !== undefined ? propIntent : (propIntent ?? null);

  return (
    <Box
      flexDirection="column"
      width={isSideBySide ? '55%' : '100%'}
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={1}
    >
      <Box marginBottom={0}>
        <Text bold color={theme.colors.primary}>
          Intent Details & Actions
        </Text>
      </Box>

      {intent ? (
        <Box flexDirection="column" width="100%">
          <Box justifyContent="space-between">
            <Box gap={1}>
              <Text bold>Name: </Text>
              <Text bold color={theme.colors.primary}>
                {intent.name}
              </Text>
            </Box>
            <Text color={STATUS_BADGE_MAP[intent.status]?.color || 'white'} bold>
              {intent.status}
            </Text>
          </Box>
          <Box>
            <Text bold>Title: </Text>
            <Text wrap="truncate-end">{intent.title}</Text>
          </Box>
          <Box justifyContent="space-between">
            <Box gap={1}>
              <Text bold>Tasks: </Text>
              <Text>{intent.taskCount} tasks defined</Text>
            </Box>
            {intent.updatedAt && (
              <Box gap={1}>
                <Text bold>Updated: </Text>
                <Text dimColor>{new Date(intent.updatedAt).toLocaleTimeString()}</Text>
              </Box>
            )}
          </Box>

          {/* Action feedback */}
          {actionFeedback && (
            <Box
              marginY={0}
              paddingX={1}
              borderStyle="single"
              borderColor={
                actionFeedback.type === 'success'
                  ? theme.colors.success
                  : actionFeedback.type === 'error'
                  ? theme.colors.error
                  : theme.colors.warning
              }
            >
              <Text
                color={
                  actionFeedback.type === 'success'
                    ? theme.colors.success
                    : actionFeedback.type === 'error'
                    ? theme.colors.error
                    : theme.colors.warning
                }
                bold
                wrap="truncate-end"
              >
                {actionFeedback.message}
              </Text>
            </Box>
          )}

          {/* Validation errors */}
          {validationErrors && validationErrors.length > 0 && (
            <Box flexDirection="column" marginY={0}>
              <Text color={theme.colors.error} bold>
                Errors ({validationErrors.length}):
              </Text>
              {validationErrors.slice(0, 2).map((err, i) => (
                <Text key={i} color={theme.colors.error} dimColor wrap="truncate-end">
                  • {err}
                </Text>
              ))}
              {validationErrors.length > 2 && (
                <Text dimColor>...and {validationErrors.length - 2} more</Text>
              )}
            </Box>
          )}

          {/* Status indicators */}
          {isValidating && (
            <Box marginY={0}>
              <Text color={theme.colors.warning}>🔍 Validating plan dependency DAG...</Text>
            </Box>
          )}

          {/* Progress / Generation Card (e.g. IntentPlanProgress) */}
          {children}

          {/* Action shortcuts hint */}
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>[Enter] Open in Run  │  [t] Open in Tasks  │  [g] Generate Plan</Text>
            <Text dimColor>[v] Validate Plan    │  [c] Create         │  [p] Pull  │  [d] Delete</Text>
          </Box>
        </Box>
      ) : (
        <Box paddingY={1} justifyContent="center">
          <Text dimColor>Select an intent to view details and execute actions.</Text>
        </Box>
      )}
    </Box>
  );
});

IntentDetails.displayName = 'IntentDetails';export default IntentDetails;
