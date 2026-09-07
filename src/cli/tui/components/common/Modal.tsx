import React from 'react';
import { Box, Text, useInput } from 'ink';

export interface ModalProps {
  title?: string;
  isOpen?: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
  width?: number | string;
  borderColor?: string;
}

/**
 * Generic Modal container dialog for CodeForge TUI.
 * Features:
 * - Centered layout with rounded borders (╭─╮)
 * - Esc-to-close behavior via useInput
 * - Header bar with title and close prompt
 */
export const Modal: React.FC<ModalProps> = ({
  title,
  isOpen = true,
  onClose,
  children,
  width = 60,
  borderColor = 'cyan',
}) => {
  useInput(
    (input, key) => {
      if (key.escape && onClose) {
        onClose();
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen) {
    return null;
  }

  const isFullWidth = width === '100%';

  const contentBox = (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={2}
      paddingY={0}
      width={width}
      flexGrow={isFullWidth ? 1 : undefined}
    >
      {title && (
        <Box marginBottom={1} justifyContent="space-between" width="100%">
          <Text bold color={borderColor}>
            ● {title}
          </Text>
          <Text bold color="red">[Esc] Close / Voltar</Text>
        </Box>
      )}
      <Box flexDirection="column" width="100%">
        {children}
      </Box>
    </Box>
  );

  if (isFullWidth) {
    return contentBox;
  }

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
    >
      {contentBox}
    </Box>
  );
};
