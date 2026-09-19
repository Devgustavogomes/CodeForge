import React from 'react';
import { Box, Text } from 'ink';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { ConfigFieldKey } from './ConfigField.js';
import { HooksPreview } from './previews/HooksPreview.js';
import { AgentPreview } from './previews/AgentPreview.js';
import { EnvironmentPreview } from './previews/EnvironmentPreview.js';
import { IntentSourcePreview, } from './previews/IntentSourcePreview.js';
import { GenericPreview } from './previews/GenericPreview.js';
import { theme } from '../../../theme.js';

export interface ConfigPreviewProps {
  isSideBySide: boolean;
  activeField: ConfigFieldKey;
  config: CodeForgeConfig;
  isLoadingAgents: boolean;
  currentAgentOptions: string[];
  availableEnvironments: string[];
  availableIntentSourceProviders?: string[];}

export const PREVIEW_COMPONENTS: Partial<Record<ConfigFieldKey, React.FC<ConfigPreviewProps>>> = {
  hooks: HooksPreview,
  plannerAgent: AgentPreview,
  executorAgent: AgentPreview,
  environment: EnvironmentPreview,
  intentSource: IntentSourcePreview,};

export const ConfigPreviewShortcuts: React.FC<{ activeField: ConfigFieldKey }> = ({ activeField }) => {
  return (
    <Box marginTop={1} borderStyle="single" borderColor={theme.colors.borderSubtle} paddingX={1} flexDirection="column">
      <Text bold color={theme.colors.text}>Navigation Shortcuts:</Text>
      {activeField === 'hooks' ? (
        <>
          <Text color={theme.colors.muted}>[Enter] Abrir Gerenciador de Hooks</Text>
          <Text color={theme.colors.muted}>[↑/↓] or [Tab] Select Field</Text>
          <Text color={theme.colors.muted}>[s] Quick Save to File</Text>
        </>
      ) : activeField === 'intentSource' ? (
        <>
          <Text color={theme.colors.muted}>[Enter] Configurar Intent Source</Text>
          <Text color={theme.colors.muted}>[↑/↓] or [Tab] Select Field</Text>
          <Text color={theme.colors.muted}>[s] Quick Save to File</Text>
        </>
      ) : (
        <>
          <Text color={theme.colors.muted}>[↑/↓] or [Tab] Select Field</Text>
          <Text color={theme.colors.muted}>[Space/←/→] Cycle Option</Text>
          <Text color={theme.colors.muted}>[e] Custom Edit</Text>
          <Text color={theme.colors.muted}>[s] Quick Save to File</Text>
          <Text color={theme.colors.muted}>[Esc] Cancel Edit</Text>
        </>
      )}
    </Box>
  );
};

export const ConfigPreview: React.FC<ConfigPreviewProps> = (props) => {
  const { isSideBySide, activeField } = props;
  const PreviewComponent = PREVIEW_COMPONENTS[activeField] ?? GenericPreview;

  return (
    <Box
      flexDirection="column"
      width={isSideBySide ? '45%' : '100%'}
      borderStyle="round"
      borderColor={theme.colors.borderSubtle}
      paddingX={1}
    >
      <PreviewComponent {...props} />
      <ConfigPreviewShortcuts activeField={activeField} />
    </Box>
  );
};
