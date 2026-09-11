import React from 'react';
import { Box, Text } from 'ink';

export interface TextInputProps {
  value: string;
  placeholder?: string;
  isFocused?: boolean;
  cursorColor?: string;
  showCharCount?: boolean;
  width?: number | string;
}

/**
 * Visual text input component for CodeForge Ink TUI.
 * Renders text content, dimmed placeholder when empty, block cursor (█)
 * in active focus color, and optional character counter.
 */
export const TextInput: React.FC<TextInputProps> = ({
  value,
  placeholder = '',
  isFocused = false,
  cursorColor = 'cyan',
  showCharCount = false,
  width,
}) => {
  const hasValue = value.length > 0;

  return (
    <Box width={width} justifyContent={showCharCount ? 'space-between' : undefined}>
      <Box flexShrink={1}>
        {hasValue ? (
          <Text color="white" bold={isFocused} wrap="truncate-end">
            {value}
            {isFocused && <Text color={cursorColor}>█</Text>}
          </Text>
        ) : isFocused ? (
          <Box gap={1}>
            <Text color={cursorColor}>█</Text>
            {placeholder ? (
              <Text dimColor wrap="truncate-end">
                {placeholder}
              </Text>
            ) : null}
          </Box>
        ) : placeholder ? (
          <Text dimColor wrap="truncate-end">
            {placeholder}
          </Text>
        ) : null}
      </Box>

      {showCharCount && (
        <Box flexShrink={0} paddingLeft={1}>
          <Text dimColor>{value.length} chars</Text>
        </Box>
      )}
    </Box>
  );
};
