import React from 'react';
import { Box, Text } from 'ink';
import type { ConfigFieldProps } from '../ConfigField.js';
import { theme } from '../../../../theme.js';

export const AgentField: React.FC<ConfigFieldProps> = ({
  fieldKey,
  isActive,
  isEditing,
  editValue,
  config,
  currentAgentOptions,
}) => {
  const isPlanner = fieldKey === 'plannerAgent';
  const label = isPlanner ? '3. Planner Agent Model:' : '4. Executor Agent Model:';
  const agentValue = isPlanner ? config.plannerAgent : config.executorAgent;

  return (
    <Box gap={1} flexWrap="nowrap">
      <Box gap={1} flexShrink={1}>
        <Text bold color={isActive ? theme.colors.primary : theme.colors.text}>
          {label}
        </Text>
        {isEditing && isActive ? (
          <Box gap={1}>
            <Text color={theme.colors.primary} bold>
              {'> '}
            </Text>
            {editValue.length > 0 ? (
              <Text color={theme.colors.text} bold>
                {editValue}█
              </Text>
            ) : (
              <Box gap={1}>
                <Text color={theme.colors.primary}>█</Text>
                <Text color={theme.colors.muted}>({agentValue})</Text>
              </Box>
            )}
          </Box>
        ) : (
          <Box gap={1}>
            <Text color={theme.colors.primary} bold>
              &lt; [ {agentValue} ] &gt;
            </Text>
            {currentAgentOptions.length > 1 && (
              <Text color={theme.colors.muted}>
                (
                {Math.max(
                  1,
                  currentAgentOptions.indexOf(agentValue) + 1,
                )}
                /{currentAgentOptions.length})
              </Text>
            )}
          </Box>
        )}
      </Box>
      {isActive && !isEditing && (
        <Text color={theme.colors.muted}>[e]</Text>
      )}
    </Box>
  );
};
