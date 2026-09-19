import React from 'react';
import { Box, Text } from 'ink';
import { Modal } from '../common/Modal.js';
import { IntentSourceForm } from './components/IntentSourceForm.js';
import { useConfigureIntentSourceModal } from './hooks/useConfigureIntentSourceModal.js';
import { CodeForgeConfig } from '../../../../config/types.js';
import { ConfigService } from '../../../../config/ConfigService.js';
import { IntentSourceConfig } from '../../../../domain/intent-source.js';
import { theme } from '../../theme.js';

export interface ConfigureIntentSourceModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  config?: CodeForgeConfig;
  configService?: ConfigService;
  onUpdateIntentSource?: (intentSource: IntentSourceConfig) => void;  width?: number | string;
}
/**
 * Modal dialog for configuring external/local Intent Source in CodeForge TUI.
 * Allows choosing provider (filesystem, linear, github, clickup) and
 * configuring project (owner/repo / listId), team, and apiKey (or $ENV_VAR).
 */
export const ConfigureIntentSourceModal: React.FC<ConfigureIntentSourceModalProps> = ({
  isOpen = true,
  onClose,
  config,
  configService,
  onUpdateIntentSource,
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
    saveIntentSource,
  } = useConfigureIntentSourceModal({
    isOpen,
    onClose,
    config,
    configService,
    onUpdateIntentSource,  });

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      title="Configuração de Intent Source"
      isOpen={isOpen}
      width={width}
      borderColor={theme.colors.primary}
    >
      <Box flexDirection="column" width="100%">
        <IntentSourceForm
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
          onSubmit={saveIntentSource}
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
};export default ConfigureIntentSourceModal;
