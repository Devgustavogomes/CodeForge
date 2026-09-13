import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../../theme.js';
import { SpecItemWithStats, STATUS_BADGE_MAP } from './SpecList.js';

export interface SpecDetailsProps {
  spec: SpecItemWithStats | null;
  isSideBySide?: boolean;
  isValidating?: boolean;
  actionFeedback?: { type: 'info' | 'success' | 'error'; message: string } | null;
  validationErrors?: string[] | null;
  children?: React.ReactNode;
}

export const SpecDetails: React.FC<SpecDetailsProps> = memo(({
  spec,
  isSideBySide = true,
  isValidating = false,
  actionFeedback,
  validationErrors,
  children,
}) => {
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
          Spec Details & Actions
        </Text>
      </Box>

      {spec ? (
        <Box flexDirection="column" width="100%">
          <Box justifyContent="space-between">
            <Box gap={1}>
              <Text bold>Name: </Text>
              <Text bold color={theme.colors.primary}>
                {spec.name}
              </Text>
            </Box>
            <Text color={STATUS_BADGE_MAP[spec.status]?.color || 'white'} bold>
              {spec.status}
            </Text>
          </Box>
          <Box>
            <Text bold>Title: </Text>
            <Text wrap="truncate-end">{spec.title}</Text>
          </Box>
          <Box justifyContent="space-between">
            <Box gap={1}>
              <Text bold>Tasks: </Text>
              <Text>{spec.taskCount} tasks defined</Text>
            </Box>
            {spec.updatedAt && (
              <Box gap={1}>
                <Text bold>Updated: </Text>
                <Text dimColor>{new Date(spec.updatedAt).toLocaleTimeString()}</Text>
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

          {/* Progress / Generation Card (e.g. SpecPlanProgress) */}
          {children}

          {/* Action shortcuts hint */}
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>[Enter] Open in Run  │  [t] Open in Tasks  │  [g] Generate Plan</Text>
            <Text dimColor>[v] Validate Plan    │  [c] Create         │  [p] Pull  │  [d] Delete</Text>
          </Box>
        </Box>
      ) : (
        <Box paddingY={1} justifyContent="center">
          <Text dimColor>Select a specification to view details and execute actions.</Text>
        </Box>
      )}
    </Box>
  );
});

SpecDetails.displayName = 'SpecDetails';
export default SpecDetails;
