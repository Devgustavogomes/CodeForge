import React from 'react';
import { Box, Text, useInput } from 'ink';
import { SupportedLanguage } from '../../../../config/types.js';
import { translate } from '../../../ui/i18n.js';
import { theme } from '../../theme.js';
import { Modal } from './Modal.js';

export interface ConfirmDeleteModalProps {
  title: string;
  body: React.ReactNode;
  detail?: React.ReactNode;
  warning?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  isOpen?: boolean;
  language?: SupportedLanguage;
  confirmLabel?: string;
  cancelLabel?: string;
  width?: number | string;
}

interface ModalContentProps {
  children: React.ReactNode;
  color?: string;
  bold?: boolean;
}

const ModalContent: React.FC<ModalContentProps> = ({ children, color, bold }) => {
  if (typeof children === 'string' || typeof children === 'number') {
    return (
      <Text color={color} bold={bold}>
        {children}
      </Text>
    );
  }

  return <>{children}</>;
};

/**
 * Presentation-only confirmation dialog for destructive actions.
 *
 * Consumers supply already-localized entity content and must disable their
 * screen-level input hook while `isOpen` is true. Escape is delegated to the
 * common Modal so cancellation is dispatched exactly once.
 */
export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  title,
  body,
  detail,
  warning,
  onConfirm,
  onCancel,
  isOpen = true,
  language = 'en',
  confirmLabel = translate('tui_delete_confirm', language),
  cancelLabel = translate('tui_delete_cancel', language),
  width = 64,
}) => {
  useInput(
    (input, key) => {
      if (input === 'y' || input === 'Y' || key.return) {
        onConfirm();
        return;
      }

      if (input === 'n' || input === 'N') {
        onCancel();
      }
    },
    { isActive: isOpen },
  );

  return (
    <Modal
      title={title}
      isOpen={isOpen}
      onClose={onCancel}
      borderColor={theme.colors.error}
      width={width}
    >
      <Box flexDirection="column" gap={1} paddingY={1}>
        <ModalContent>{body}</ModalContent>

        {detail !== undefined && detail !== null && (
          <Box
            borderStyle="single"
            borderColor={theme.colors.borderSubtle}
            paddingX={1}
          >
            <ModalContent bold>{detail}</ModalContent>
          </Box>
        )}

        {warning !== undefined && warning !== null && (
          <Box marginTop={1}>
            <ModalContent color={theme.colors.warning}>{warning}</ModalContent>
          </Box>
        )}

        <Box justifyContent="space-between" marginTop={1}>
          <Text bold color={theme.colors.error}>
            {confirmLabel}
          </Text>
          <Text dimColor>{cancelLabel}</Text>
        </Box>
      </Box>
    </Modal>
  );
};

export default ConfirmDeleteModal;
