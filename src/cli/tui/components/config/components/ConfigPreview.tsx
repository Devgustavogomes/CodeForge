import React from 'react';
import { Box, Text } from 'ink';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { ConfigFieldKey } from './ConfigField.js';
import { HooksPreview } from './previews/HooksPreview.js';
import { AgentPreview } from './previews/AgentPreview.js';
import { EnvironmentPreview } from './previews/EnvironmentPreview.js';
import { SpecSourcePreview } from './previews/SpecSourcePreview.js';
import { GenericPreview } from './previews/GenericPreview.js';

export interface ConfigPreviewProps {
  isSideBySide: boolean;
  activeField: ConfigFieldKey;
  config: CodeForgeConfig;
  isLoadingAgents: boolean;
  currentAgentOptions: string[];
  availableEnvironments: string[];
  availableSpecSourceProviders?: string[];
}

export const PREVIEW_COMPONENTS: Partial<Record<ConfigFieldKey, React.FC<ConfigPreviewProps>>> = {
  hooks: HooksPreview,
  plannerAgent: AgentPreview,
  executorAgent: AgentPreview,
  environment: EnvironmentPreview,
  specSource: SpecSourcePreview,
};

export const ConfigPreviewShortcuts: React.FC<{ activeField: ConfigFieldKey }> = ({ activeField }) => {
  return (
    <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
      <Text bold color="white">Navigation Shortcuts:</Text>
      {activeField === 'hooks' ? (
        <>
          <Text dimColor>[Enter] Abrir Gerenciador de Hooks</Text>
          <Text dimColor>[↑/↓] or [Tab] Select Field</Text>
          <Text dimColor>[s] Quick Save to File</Text>
        </>
      ) : activeField === 'specSource' ? (
        <>
          <Text dimColor>[Enter] Configurar Spec Source</Text>
          <Text dimColor>[↑/↓] or [Tab] Select Field</Text>
          <Text dimColor>[s] Quick Save to File</Text>
        </>
      ) : (
        <>
          <Text dimColor>[↑/↓] or [Tab] Select Field</Text>
          <Text dimColor>[Space/←/→] Cycle Option</Text>
          <Text dimColor>[e] Custom Edit</Text>
          <Text dimColor>[s] Quick Save to File</Text>
          <Text dimColor>[Esc] Cancel Edit</Text>
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
      borderColor="gray"
      paddingX={1}
    >
      <PreviewComponent {...props} />
      <ConfigPreviewShortcuts activeField={activeField} />
    </Box>
  );
};

