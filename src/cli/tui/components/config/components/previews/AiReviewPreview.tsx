import React from 'react';
import { Box, Text } from 'ink';
import { resolveAiReviewConfig } from '../../../../../../config/types.js';
import type { ConfigPreviewProps } from '../ConfigPreview.js';
import { theme } from '../../../../theme.js';

export const AiReviewPreview: React.FC<ConfigPreviewProps> = ({ config }) => {
  const review = resolveAiReviewConfig(config.aiReview);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.colors.primary}>AI Review Configuration</Text>
      <Text color={theme.colors.muted}>Status: {review.enabled ? 'Enabled' : 'Disabled'}</Text>
      <Text color={theme.colors.muted}>Reviewer agent: {review.agent}</Text>
      <Text color={theme.colors.muted}>Maximum rounds: {review.maxRounds}</Text>
      <Box marginTop={1}>
        <Text color={theme.colors.primary} bold>[Enter] Configure AI Review</Text>
      </Box>
    </Box>
  );
};
