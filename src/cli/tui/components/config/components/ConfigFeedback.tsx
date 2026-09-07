import React from 'react';
import { Box, Text } from 'ink';

export interface ConfigFeedbackProps {
  feedback: {
    type: 'success' | 'error' | 'info';
    message: string;
  } | null;
  isDirty?: boolean;
}

export const UnsavedChangesNotice: React.FC<{ isDirty?: boolean }> = ({ isDirty }) => {
  if (!isDirty) return null;
  return (
    <Text color="yellow" bold>
      ● Unsaved Changes
    </Text>
  );
};

export const ConfigFeedback: React.FC<ConfigFeedbackProps> = ({ feedback, isDirty }) => {
  const color =
    feedback?.type === 'success'
      ? 'green'
      : feedback?.type === 'error'
        ? 'red'
        : 'yellow';

  return (
    <Box flexDirection="column" width="100%">
      {isDirty !== undefined && (
        <UnsavedChangesNotice isDirty={isDirty} />
      )}
      {feedback && (
        <Box
          marginBottom={1}
          paddingX={1}
          borderStyle="single"
          borderColor={color}
        >
          <Text color={color} bold>
            {feedback.message}
          </Text>
        </Box>
      )}
    </Box>
  );
};
