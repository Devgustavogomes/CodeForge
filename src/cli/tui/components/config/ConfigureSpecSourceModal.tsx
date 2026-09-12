import React from 'react';
import { Box, Text } from 'ink';
import { Modal } from '../common/Modal.js';
import { SpecSourceForm } from './components/SpecSourceForm.js';
import { useConfigureSpecSourceModal } from './hooks/useConfigureSpecSourceModal.js';
import { CodeForgeConfig } from '../../../../config/types.js';
import { ConfigService } from '../../../../config/ConfigService.js';
import { SpecSourceConfig } from '../../../../domain/spec-source.js';
import { theme } from '../../theme.js';

export interface ConfigureSpecSourceModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  config?: CodeForgeConfig;
  configService?: ConfigService;
  onUpdateSpecSource?: (specSource: SpecSourceConfig) => void;
  width?: number | string;
}

/**
 * Modal dialog for configuring external/local Spec Source in CodeForge TUI.
 * Allows choosing provider (filesystem, linear, github, clickup) and
 * configuring project (owner/repo / listId), team, and apiKey (or $ENV_VAR).
 */
export const ConfigureSpecSourceModal: React.FC<ConfigureSpecSourceModalProps> = ({
  isOpen = true,
  onClose,
  config,
  configService,
  onUpdateSpecSource,
  width = '100%',
}) => {
  const {
    provider,
    setProvider,
    project,
    setProject,
    team,
    setTeam,
    apiKey,
    setApiKey,
    activeFormField,
    activeFormFieldIndex,
    formErrorMessage,
    feedbackMessage,
    availableProviders,
    saveSpecSource,
  } = useConfigureSpecSourceModal({
    isOpen,
    onClose,
    config,
    configService,
    onUpdateSpecSource,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      title="Configuração de Spec Source"
      isOpen={isOpen}
      width={width}
      borderColor={theme.colors.primary}
    >
      <Box flexDirection="column" width="100%">
        <SpecSourceForm
          activeField={activeFormField}
          activeFieldIndex={activeFormFieldIndex}
          provider={provider}
          project={project}
          team={team}
          apiKey={apiKey}
          availableProviders={availableProviders}
          errorMessage={formErrorMessage}
          onChangeProvider={setProvider}
          onChangeProject={setProject}
          onChangeTeam={setTeam}
          onChangeApiKey={setApiKey}
          onSubmit={saveSpecSource}
          onCancel={onClose}
        />

        {feedbackMessage && (
          <Box
            marginTop={1}
            borderStyle="single"
            borderColor={feedbackMessage.startsWith('✔') ? theme.colors.success : theme.colors.error}
            paddingX={1}
            justifyContent="space-between"
          >
            <Text
              color={feedbackMessage.startsWith('✔') ? theme.colors.success : theme.colors.error}
              bold
            >
              {feedbackMessage}
            </Text>
            <Text color={theme.colors.muted}>[Auto-Save]</Text>
          </Box>
        )}
      </Box>
    </Modal>
  );
};
