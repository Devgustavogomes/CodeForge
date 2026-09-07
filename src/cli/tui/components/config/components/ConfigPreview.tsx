import React from 'react';
import { Box, Text } from 'ink';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { ConfigFieldKey } from './ConfigField.js';

export interface ConfigPreviewProps {
  isSideBySide: boolean;
  activeField: ConfigFieldKey;
  config: CodeForgeConfig;
  isLoadingAgents: boolean;
  currentAgentOptions: string[];
  availableEnvironments: string[];
}

export const ConfigPreview: React.FC<ConfigPreviewProps> = ({
  isSideBySide,
  activeField,
  config,
  isLoadingAgents,
  currentAgentOptions,
  availableEnvironments,
}) => {
  return (
    <Box
      flexDirection="column"
      width={isSideBySide ? '45%' : '100%'}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      {activeField === 'plannerAgent' || activeField === 'executorAgent' ? (
        <Box flexDirection="column" marginBottom={1}>
          <Box justifyContent="space-between" marginBottom={0}>
            <Text bold color="cyan">
              {activeField === 'plannerAgent' ? 'Planner' : 'Executor'} Models ({config.environment})
            </Text>
            {isLoadingAgents && <Text color="yellow">⏳</Text>}
          </Box>
          <Box flexDirection="column" marginY={0}>
            {currentAgentOptions.slice(0, 6).map((opt) => {
              const isCurrent =
                (activeField === 'plannerAgent'
                  ? config.plannerAgent
                  : config.executorAgent) === opt;
              return (
                <Box key={opt} gap={1}>
                  <Text color={isCurrent ? 'cyan' : 'gray'} bold={isCurrent}>
                    {isCurrent ? '❯ ●' : '  ○'}
                  </Text>
                  <Text color={isCurrent ? 'cyan' : 'white'} bold={isCurrent} wrap="truncate-end">
                    {opt}
                  </Text>
                </Box>
              );
            })}
            {currentAgentOptions.length > 6 && (
              <Text dimColor> ...and {currentAgentOptions.length - 6} more</Text>
            )}
          </Box>
        </Box>
      ) : activeField === 'environment' ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">Runner Environments</Text>
          <Box flexDirection="column" marginY={0}>
            {availableEnvironments.map((env) => {
              const isCurrent = config.environment === env;
              return (
                <Box key={env} gap={1}>
                  <Text color={isCurrent ? 'cyan' : 'gray'} bold={isCurrent}>
                    {isCurrent ? '❯ ●' : '  ○'}
                  </Text>
                  <Text color={isCurrent ? 'cyan' : 'white'} bold={isCurrent}>
                    {env}
                  </Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">Configuration Preview</Text>
          <Text dimColor>Language: {config.language}</Text>
          <Text dimColor>Runner: {config.environment}</Text>
          <Text dimColor>Planner Model: {config.plannerAgent}</Text>
          <Text dimColor>Executor Model: {config.executorAgent}</Text>
          <Text dimColor>
            Hooks:{' '}
            {Object.values(config.hooks || {}).filter(
              (v) => Array.isArray(v) && v.length > 0,
            ).length}{' '}
            active
          </Text>
        </Box>
      )}

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
        <Text bold color="white">Navigation Shortcuts:</Text>
        <Text dimColor>[↑/↓] or [Tab] Select Field</Text>
        <Text dimColor>[Space/←/→] Cycle Option</Text>
        <Text dimColor>[e] Custom Edit</Text>
        <Text dimColor>[s] Quick Save to File</Text>
        <Text dimColor>[Esc] Cancel Edit</Text>
      </Box>
    </Box>
  );
};
