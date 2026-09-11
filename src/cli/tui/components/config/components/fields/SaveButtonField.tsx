import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigFieldProps } from '../ConfigField.js';

export const SaveButtonField: React.FC<ConfigFieldProps> = ({
  isActive,
}) => {
  return (
    <Box
      marginTop={1}
      borderStyle="single"
      borderColor={isActive ? 'green' : 'gray'}
      paddingX={1}
      justifyContent="center"
    >
      <Text color={isActive ? 'green' : 'white'} bold>
        [ Save Configuration to config.yaml ]
      </Text>
    </Box>
  );
};
