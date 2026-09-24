import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigFieldProps } from '../ConfigField.js';
import { theme } from '../../../../theme.js';

export const SaveButtonField: React.FC<ConfigFieldProps> = ({
  isActive,
}) => {
  return (
    <Box
      marginTop={1}
      borderStyle="single"
      borderColor={isActive ? theme.colors.success : theme.colors.borderSubtle}
      paddingX={1}
      justifyContent="center"
    >
      <Text color={isActive ? theme.colors.success : theme.colors.text} bold>
        [ Save Configuration to config.yaml ]
      </Text>
    </Box>
  );
};
