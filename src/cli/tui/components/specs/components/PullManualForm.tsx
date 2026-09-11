import React from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '../../common/TextInput.js';

export interface PullManualFormProps {
  specId: string;
  customName: string;
  activeField: 'provider' | 'id' | 'name';
  selectedProvider: string;
  showIdInput: boolean;
}

function getProviderIdPlaceholder(provider: string): string {
  switch (provider) {
    case 'github':
      return 'e.g. 102 or https://github.com/owner/repo/issues/102';
    case 'linear':
      return 'e.g. ENG-123';
    case 'clickup':
      return 'e.g. 86789abc';
    default:
      return 'e.g. specs/feature.md';
  }
}

/**
 * Visual subcomponent for entering manual specification ID and custom filename.
 * Utilizes the shared TextInput primitive with focused block cursor styling.
 */
export const PullManualForm: React.FC<PullManualFormProps> = ({
  specId,
  customName,
  activeField,
  selectedProvider,
  showIdInput,
}) => {
  return (
    <Box flexDirection="column" width="100%" marginBottom={0}>
      {showIdInput && (
        <Box gap={1} paddingLeft={1} marginTop={0}>
          <Text color="blue" bold>
            {'> '}
          </Text>
          <TextInput
            value={specId}
            placeholder={getProviderIdPlaceholder(selectedProvider)}
            isFocused={activeField === 'id'}
            cursorColor="cyan"
          />
        </Box>
      )}

      <Box justifyContent="space-between" width="100%" marginBottom={0}>
        <Box gap={1} flexShrink={1}>
          <Text bold color={activeField === 'name' ? 'cyan' : 'white'}>
            3. Custom Filename (optional):
          </Text>
          <Text color="blue" bold>
            {'> '}
          </Text>
          <TextInput
            value={customName}
            placeholder="Leave empty to derive from title or ID"
            isFocused={activeField === 'name'}
            cursorColor="cyan"
          />
        </Box>
      </Box>
    </Box>
  );
};
