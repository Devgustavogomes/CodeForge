import React from 'react';
import { Box, Text } from 'ink';
import { CodeForgeConfig, SupportedLanguage } from '../../../../../config/types.js';

export type ConfigFieldKey =
  | 'language'
  | 'environment'
  | 'plannerAgent'
  | 'executorAgent'
  | 'hooks'
  | 'saveButton';

export const FIELD_ORDER: ConfigFieldKey[] = [
  'language',
  'environment',
  'plannerAgent',
  'executorAgent',
  'hooks',
  'saveButton',
];

export const LANGUAGES: SupportedLanguage[] = ['en', 'pt', 'es'];

export interface ConfigFieldProps {
  fieldKey: ConfigFieldKey;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  config: CodeForgeConfig;
  availableEnvironments: string[];
  currentAgentOptions: string[];
}

export const ConfigField: React.FC<ConfigFieldProps> = ({
  fieldKey,
  isActive,
  isEditing,
  editValue,
  config,
  availableEnvironments,
  currentAgentOptions,
}) => {
  if (fieldKey === 'language') {
    return (
      <Box width="100%">
        <Box gap={1}>
          <Text bold color={isActive ? 'cyan' : 'white'}>
            1. Language (i18n):
          </Text>
          <Box gap={1}>
            {LANGUAGES.map((lang) => {
              const isSelected = config.language === lang;
              return (
                <Text
                  key={lang}
                  color={isSelected ? 'cyan' : 'gray'}
                  bold={isSelected}
                >
                  {isSelected ? `● [${lang}]` : `○ ${lang}`}
                </Text>
              );
            })}
          </Box>
        </Box>
      </Box>
    );
  }

  if (fieldKey === 'environment') {
    return (
      <Box width="100%">
        <Box gap={1} flexShrink={1}>
          <Text bold color={isActive ? 'cyan' : 'white'}>
            2. Runner Environment:
          </Text>
          <Box gap={1}>
            <Text color="cyan" bold>
              &lt; [ {config.environment} ] &gt;
            </Text>
            {availableEnvironments.length > 1 && (
              <Text dimColor>
                (
                {Math.max(
                  1,
                  availableEnvironments.indexOf(config.environment) + 1,
                )}
                /{availableEnvironments.length})
              </Text>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  if (fieldKey === 'plannerAgent') {
    return (
      <Box gap={1} flexWrap="nowrap">
        <Box gap={1} flexShrink={1}>
          <Text bold color={isActive ? 'cyan' : 'white'}>
            3. Planner Agent Model:
          </Text>
          {isEditing && isActive ? (
            <Box gap={1}>
              <Text color="blue" bold>
                {'> '}
              </Text>
              {editValue.length > 0 ? (
                <Text color="white" bold>
                  {editValue}█
                </Text>
              ) : (
                <Box gap={1}>
                  <Text color="cyan">█</Text>
                  <Text dimColor>({config.plannerAgent})</Text>
                </Box>
              )}
            </Box>
          ) : (
            <Box gap={1}>
              <Text color="cyan" bold>
                &lt; [ {config.plannerAgent} ] &gt;
              </Text>
              {currentAgentOptions.length > 1 && (
                <Text dimColor>
                  (
                  {Math.max(
                    1,
                    currentAgentOptions.indexOf(config.plannerAgent) + 1,
                  )}
                  /{currentAgentOptions.length})
                </Text>
              )}
            </Box>
          )}
        </Box>
        {isActive && !isEditing && (
          <Text dimColor>[e]</Text>
        )}
      </Box>
    );
  }

  if (fieldKey === 'executorAgent') {
    return (
      <Box gap={1} flexWrap="nowrap">
        <Box gap={1} flexShrink={1}>
          <Text bold color={isActive ? 'cyan' : 'white'}>
            4. Executor Agent Model:
          </Text>
          {isEditing && isActive ? (
            <Box gap={1}>
              <Text color="blue" bold>
                {'> '}
              </Text>
              {editValue.length > 0 ? (
                <Text color="white" bold>
                  {editValue}█
                </Text>
              ) : (
                <Box gap={1}>
                  <Text color="cyan">█</Text>
                  <Text dimColor>({config.executorAgent})</Text>
                </Box>
              )}
            </Box>
          ) : (
            <Box gap={1}>
              <Text color="cyan" bold>
                &lt; [ {config.executorAgent} ] &gt;
              </Text>
              {currentAgentOptions.length > 1 && (
                <Text dimColor>
                  (
                  {Math.max(
                    1,
                    currentAgentOptions.indexOf(config.executorAgent) + 1,
                  )}
                  /{currentAgentOptions.length})
                </Text>
              )}
            </Box>
          )}
        </Box>
        {isActive && !isEditing && (
          <Text dimColor>[e]</Text>
        )}
      </Box>
    );
  }

  if (fieldKey === 'hooks') {
    const totalHooks = Object.values(config.hooks || {}).reduce(
      (acc, list) => acc + (Array.isArray(list) ? list.length : 0),
      0,
    );

    return (
      <Box width="100%">
        <Box gap={1} flexShrink={1}>
          <Text bold color={isActive ? 'cyan' : 'white'}>
            5. Hooks:
          </Text>
          <Text color="cyan" bold>
            [ {totalHooks} configurados ]
          </Text>
        </Box>
      </Box>
    );
  }

  if (fieldKey === 'saveButton') {
    return (
      <Box
        marginTop={1}
        borderStyle="single"
        borderColor={isActive ? 'green' : 'gray'}
        paddingX={1}
        justifyContent="center"
      >
        <Text color={isActive ? 'green' : 'white'} bold>
          [ Save Configuration to config.yaml ]
        </Text>
      </Box>
    );
  }

  return null;
};
