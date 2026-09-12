import React from 'react';
import { Box, Text } from 'ink';
import { Modal } from '../common/Modal.js';
import {
  usePullSpecModal,
  UsePullSpecModalOptions,
} from './hooks/usePullSpecModal.js';
import { PullItemList } from './components/PullItemList.js';
import { PullManualForm } from './components/PullManualForm.js';

export interface PullSpecModalProps extends UsePullSpecModalOptions {
  width?: number | string;
}

/**
 * Clean orchestrator component for pulling specifications from remote providers.
 * Provider is read from config (not user-selectable) — matching CLI behavior.
 * Delegates data fetching, navigation, and input handling to usePullSpecModal.
 */
export const PullSpecModal: React.FC<PullSpecModalProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
  container,
  pullSpecUseCase,
  defaultProvider,
  width = '100%',
}) => {
  const modal = usePullSpecModal({
    isOpen,
    onClose,
    onSuccess,
    container,
    pullSpecUseCase,
    defaultProvider,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      title="Pull Specification"
      isOpen={isOpen}
      onClose={modal.handleClose}
      width={width}
      borderColor="blue"
    >
      <Box flexDirection="column" width="100%">
        {/* Provider info (read-only from config) */}
        <Box marginBottom={0}>
          <Text bold>Source: </Text>
          <Text color="cyan" bold>{modal.selectedProvider}</Text>
        </Box>

        <PullItemList
          items={modal.items}
          selectedItemIndex={modal.selectedItemIndex}
          isManualInput={modal.isManualInput}
          isFetchingItems={modal.isFetchingItems}
          selectedProvider={modal.selectedProvider}
          isFocused={modal.activeField === 'id'}
        />

        <PullManualForm
          specId={modal.specId}
          customName={modal.customName}
          activeField={modal.activeField}
          selectedProvider={modal.selectedProvider}
          showIdInput={modal.isManualInput || modal.items.length === 0}
        />

        {modal.errorMessage && (
          <Box marginBottom={0}>
            <Text color="red" bold wrap="truncate-end">
              ✗ {modal.errorMessage}
            </Text>
          </Box>
        )}

        {modal.isLoading && (
          <Box marginBottom={0}>
            <Text color="yellow">
              Fetching specification from {modal.selectedProvider}...
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
          <Text dimColor>[↑/↓] Select · [Enter] Pull · [m] Manual · [Tab] Name</Text>
          <Text bold color="red">
            [Esc] Cancel
          </Text>
        </Box>
      </Box>
    </Modal>
  );
};
