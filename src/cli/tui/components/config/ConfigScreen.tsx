import React from 'react';
import { Box, Text } from 'ink';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { AppContainer } from '../../../../infrastructure/container.js';
import { ConfigService } from '../../../../config/ConfigService.js';
import { CodeForgeConfig } from '../../../../config/types.js';
import {
  ConfigField,
  FIELD_ORDER,
  ConfigFieldKey,
  LANGUAGES,
} from './components/ConfigField.js';
import { ConfigFeedback } from './components/ConfigFeedback.js';
import { ConfigPreview } from './components/ConfigPreview.js';
import { ConfigureHooksModal } from './ConfigureHooksModal.js';
import { ConfigureIntentSourceModal } from './ConfigureIntentSourceModal.js';
import { ConfigureAiReviewModal } from './ConfigureAiReviewModal.js';
import { useConfigScreen } from './hooks/useConfigScreen.js';
import { useConfigHotkeys } from './hooks/useConfigHotkeys.js';
import { theme } from '../../theme.js';

export type { ConfigFieldKey };
export { FIELD_ORDER, LANGUAGES };

export interface ConfigScreenProps {
  container?: AppContainer;
  configService?: ConfigService;
  initialConfig?: CodeForgeConfig;
  onSave?: (config: CodeForgeConfig) => void;
  isInteractive?: boolean;
}

export const ConfigScreen: React.FC<ConfigScreenProps> = ({
  container,
  configService,
  initialConfig,
  onSave,
  isInteractive = true,
}) => {
  const { breakpoint } = useTerminalDimensions();
  const configState = useConfigScreen({
    container,
    configService,
    initialConfig,
    onSave,
  });

  useConfigHotkeys({
    isInteractive:
      isInteractive &&
      !configState.isHooksModalOpen &&
      !configState.isIntentSourceModalOpen &&
      !configState.isAiReviewModalOpen,
    isEditing: configState.isEditing,
    activeField: configState.activeField,
    setEditValue: configState.setEditValue,
    setFocusedFieldIndex: configState.setFocusedFieldIndex,
    onSave: configState.handleSave,
    onCycleLanguage: configState.handleCycleLanguage,
    onCycleEnvironment: configState.handleCycleEnvironment,
    onCyclePlannerAgent: configState.handleCyclePlannerAgent,
    onCycleExecutorAgent: configState.handleCycleExecutorAgent,
    onToggleAiReview: configState.handleToggleAiReview,
    onCycleAiReviewAgent: configState.handleCycleAiReviewAgent,
    onStartEditing: configState.startEditing,
    onStartCustomEdit: configState.startCustomEdit,
    onCommitEditing: configState.commitEditing,
    onCancelEditing: configState.cancelEditing,
    onClearFeedback: () => configState.setFeedback(null),
    onOpenHooksModal: configState.openHooksModal,
    onOpenAiReviewModal: configState.openAiReviewModal,
    onOpenIntentSourceModal: configState.openIntentSourceModal,
  });

  const isSideBySide = breakpoint !== 'minimal';
  const { config, activeField, isDirty, feedback } = configState;

  if (configState.isHooksModalOpen) {
    return (
      <ConfigureHooksModal
        isOpen={true}
        onClose={configState.closeHooksModal}
        config={config}
        configService={configService ?? container?.configService}
        onUpdateHooks={configState.handleUpdateHooks}
        width="100%"
      />
    );
  }

  if (configState.isIntentSourceModalOpen) {
    return (
      <ConfigureIntentSourceModal
        isOpen={true}
        onClose={configState.closeIntentSourceModal}
        config={config}
        configService={configService ?? container?.configService}
        onUpdateIntentSource={configState.handleUpdateIntentSource}
        width="100%"
      />
    );
  }

  if (configState.isAiReviewModalOpen) {
    return <ConfigureAiReviewModal initial={config.aiReview} agents={configState.currentAgentOptions}
      onSave={configState.handleUpdateAiReview} onClose={configState.closeAiReviewModal} />;
  }

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      <Box flexDirection={isSideBySide ? 'row' : 'column'} width="100%" flexGrow={1}>
        {/* Left Column: Form Fields */}
        <Box
          flexDirection="column"
          width={isSideBySide ? '55%' : '100%'}
          borderStyle="round"
          borderColor={theme.colors.borderSubtle}
          paddingX={1}
          paddingY={1}
        >
          <Box justifyContent="space-between" marginBottom={1}>
            <Text bold color={theme.colors.text}>CodeForge Configuration Editor</Text>
            {isDirty && <Text color={theme.colors.warning} bold>● Unsaved Changes</Text>}
          </Box>

          <ConfigFeedback feedback={feedback} />

          {FIELD_ORDER.map((fieldKey) => (
            <ConfigField
              key={fieldKey}
              fieldKey={fieldKey}
              isActive={activeField === fieldKey}
              isEditing={configState.isEditing}
              editValue={configState.editValue}
              config={config}
              availableEnvironments={configState.availableEnvironments}
              currentAgentOptions={configState.currentAgentOptions}
              availableIntentSourceProviders={configState.availableIntentSourceProviders}
            />
          ))}
        </Box>

        {/* Right Column: Dynamic Inspector & Preview */}
        <ConfigPreview
          isSideBySide={isSideBySide}
          activeField={activeField}
          config={config}
          isLoadingAgents={configState.isLoadingAgents}
          currentAgentOptions={configState.currentAgentOptions}
          availableEnvironments={configState.availableEnvironments}
          availableIntentSourceProviders={configState.availableIntentSourceProviders}
        />
      </Box>
    </Box>
  );
};

export default ConfigScreen;
