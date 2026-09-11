import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import { Modal } from '../common/Modal.js';
import { TextInput } from '../common/TextInput.js';
import { useTextInput } from '../../hooks/useTextInput.js';
import { useNavigation } from '../../context/NavigationContext.js';
import {
  CreateSpecUseCase,
  CreateSpecResult,
} from '../../../../application/use-cases/CreateSpecUseCase.js';
import {
  AppContainer,
  createAppContainer,
} from '../../../../infrastructure/container.js';

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
 * Uses useTextInput and TextInput primitives for standardized input handling.
 */
export const CreateSpecModal: React.FC<CreateSpecModalProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
  container,
  createSpecUseCase,
  width = '100%',
}) => {
  const nav = useNavigation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setErrorMessage(null);
    nav?.setTextInputActive?.(false);
    if (onClose) {
      onClose();
    } else {
      nav?.closeModal();
    }
  }, [nav, onClose]);

  const handleSubmit = useCallback(
    (valueToSubmit: string) => {
      const trimmed = valueToSubmit.trim();
      if (!trimmed) {
        setErrorMessage('Specification title cannot be empty.');
        return;
      }

      try {
        const appContainer = container ?? createAppContainer();
        const useCase = createSpecUseCase ?? appContainer.createSpecUseCase;
        const result: CreateSpecResult = useCase.execute(trimmed);

        if (result.kind === 'not-initialized') {
          setErrorMessage(
            'Workspace not initialized (.codeforge/metadata.json not found).',
          );
          return;
        }

        if (result.kind === 'already-exists') {
          setErrorMessage(
            `Spec "${trimmed}" already exists at ${result.filePath}.`,
          );
          return;
        }

        if (result.kind === 'created') {
          const slug = trimmed.toLowerCase().replace(/\s+/g, '-');
          if (onSuccess) {
            onSuccess(slug, result.filePath);
          }
          handleClose();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(`Failed to create spec: ${msg}`);
      }
    },
    [container, createSpecUseCase, onSuccess, handleClose],
  );

  const { value: title, setValue: setTitle } = useTextInput({
    initialValue: '',
    isActive: isOpen,
    syncNavigation: true,
    onChange: () => setErrorMessage(null),
    onSubmit: (val) => handleSubmit(val),
    onCancel: handleClose,
  });

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setErrorMessage(null);
    }
  }, [isOpen, setTitle]);

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      title="Create Specification"
      isOpen={isOpen}
      onClose={handleClose}
      width={width}
      borderColor="blue"
    >
      <Box flexDirection="column" width="100%">
        <Box marginBottom={0}>
          <Text dimColor>
            Enter a descriptive title or slug for the new specification:
          </Text>
        </Box>

        <Box justifyContent="space-between" width="100%" marginBottom={0}>
          <Box gap={1} flexShrink={1}>
            <Text bold color="cyan">
              Title:{' '}
            </Text>
            <Text color="blue" bold>
              {'> '}
            </Text>
            <TextInput
              value={title}
              placeholder="e.g. user-authentication, payments-service"
              isFocused={true}
              cursorColor="cyan"
            />
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

        <Box
          marginTop={1}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          justifyContent="space-between"
          width="100%"
        >
          <Text dimColor>[Enter] Create</Text>
          <Text bold color="red">
            [Esc] Cancel / Voltar
          </Text>
        </Box>
      </Box>
    </Modal>
  );
};
