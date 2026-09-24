import React from 'react';
import { Box, Text } from 'ink';
import { resolveAiReviewConfig } from '../../../../../../config/types.js';
import type { ConfigFieldProps } from '../ConfigField.js';
import { theme } from '../../../../theme.js';

export const AiReviewField: React.FC<ConfigFieldProps> = ({
  isActive,
  config,
}) => {
  const review = resolveAiReviewConfig(config.aiReview);

  return (
    <Box width="100%">
      <Box gap={1} flexShrink={1}>
        <Text bold color={isActive ? theme.colors.primary : theme.colors.text}>7. AI Review:</Text>
        <Text color={review.enabled ? theme.colors.success : theme.colors.muted} bold>
          [ {review.enabled ? 'Enabled' : 'Disabled'} ]
        </Text>
      </Box>
    </Box>
  );
};
