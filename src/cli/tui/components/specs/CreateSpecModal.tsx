import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../common/Modal.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { CreateSpecUseCase, CreateSpecResult } from '../../../../application/use-cases/CreateSpecUseCase.js';
import { AppContainer, createAppContainer } from '../../../../infrastructure/container.js';

export interface CreateSpecModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: (specName: string, filePath: string) => void;
  container?: AppContainer;
  createSpecUseCase?: CreateSpecUseCase;
  width?: number | string;
}

/**
 * Modal form for creating a new specification file.
 * Handles input capture, validation, Enter to submit, and Esc to cancel.
 */
export const CreateSpecModal: React.FC<CreateSpecModalProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
  container,
  createSpecUseCase,
  width = '100%',
}) => {
  let nav: ReturnType<typeof useNavigation> | undefined;
  try {
    nav = useNavigation();
  } catch {
    // Graceful fallback outside provider
  }

  const setTextInputActive = nav?.setTextInputActive;
  const [title, setTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setErrorMessage(null);
      setTextInputActive?.(true);
    } else {
      setTextInputActive?.(false);
    }
    return () => {
      setTextInputActive?.(false);
    };
  }, [isOpen, setTextInputActive]);

  const handleClose = useCallback(() => {
    setTitle('');
    setErrorMessage(null);
    setTextInputActive?.(false);
    if (onClose) {
      onClose();
    } else {
      nav?.closeModal();
    }
  }, [nav, onClose, setTextInputActive]);

  const handleSubmit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      setErrorMessage('Specification title cannot be empty.');
      return;
    }

    try {
      const appContainer = container ?? createAppContainer();
      const useCase = createSpecUseCase ?? appContainer.createSpecUseCase;
      const result: CreateSpecResult = useCase.execute(trimmed);

      if (result.kind === 'not-initialized') {
        setErrorMessage('Workspace not initialized (.codeforge/metadata.json not found).');
        return;
      }

      if (result.kind === 'already-exists') {
        setErrorMessage(`Spec "${trimmed}" already exists at ${result.filePath}.`);
        return;
      }

      if (result.kind === 'created') {
        const slug = trimmed.toLowerCase().replace(/\s+/g, '-');
        setTextInputActive?.(false);
        if (onSuccess) {
          onSuccess(slug, result.filePath);
        }
        handleClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to create spec: ${msg}`);
    }
  }, [title, container, createSpecUseCase, onSuccess, handleClose, setTextInputActive]);

  useInput(
    (input, key) => {
      // 1. Escape: dismiss
      if (key.escape || input === '\u001B') {
        handleClose();
        return;
      }

      // 2. Enter: submit
      if (key.return || input === '\r' || input === '\n') {
        handleSubmit();
        return;
      }

      // 3. Backspace / Delete
      if (key.backspace || key.delete || input === '\x08' || input === '\x7f') {
        setTitle((prev) => prev.slice(0, -1));
        setErrorMessage(null);
        return;
      }

      // 4. Ctrl+U: clear input
      if (key.ctrl && input === 'u') {
        setTitle('');
        setErrorMessage(null);
        return;
      }

      // 5. Printable characters
      if (!key.ctrl && !key.meta) {
        const printable = input
          .split('')
          .filter((ch) => {
            const code = ch.charCodeAt(0);
            return (code >= 32 && code !== 127) || code > 127;
          })
          .join('');

        if (printable.length > 0) {
          setTitle((prev) => prev + printable);
          setErrorMessage(null);
        }
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen) {
    return null;
  }

  return (
    <Modal title="Create Specification" isOpen={isOpen} onClose={handleClose} width={width} borderColor="blue">
      <Box flexDirection="column" width="100%">
        <Box marginBottom={0}>
          <Text dimColor>Enter a descriptive title or slug for the new specification:</Text>
        </Box>

        <Box justifyContent="space-between" width="100%" marginBottom={0}>
          <Box gap={1} flexShrink={1}>
            <Text bold color="cyan">Title: </Text>
            <Text color="blue" bold>{'> '}</Text>
            {title.length > 0 ? (
              <Text color="white" bold wrap="truncate-end">
                {title}█
              </Text>
            ) : (
              <Box gap={1}>
                <Text color="cyan">█</Text>
                <Text dimColor wrap="truncate-end">
                  e.g. user-authentication, payments-service
                </Text>
              </Box>
            )}
          </Box>
          <Box flexShrink={0}>
            <Text dimColor>{title.length} chars</Text>
          </Box>
        </Box>

        {errorMessage && (
          <Box marginBottom={0}>
            <Text color="red" bold wrap="truncate-end">
              ✗ {errorMessage}
            </Text>
          </Box>
        )}

        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between" width="100%">
          <Text dimColor>[Enter] Create</Text>
          <Text bold color="red">[Esc] Cancel / Voltar</Text>
        </Box>
      </Box>
    </Modal>
  );
};
