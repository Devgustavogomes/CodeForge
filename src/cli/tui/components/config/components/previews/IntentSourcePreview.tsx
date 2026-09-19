import React from 'react';
import { Box, Text } from 'ink';
import { IntentSourceFactory } from '../../../../../../infrastructure/intent-sources/IntentSourceFactory.js';
import type { ConfigPreviewProps } from '../ConfigPreview.js';
import { theme } from '../../../../theme.js';

export const DEFAULT_INTENT_SOURCE_PROVIDERS = ['filesystem', 'linear', 'github', 'clickup'];
export const IntentSourcePreview: React.FC<ConfigPreviewProps> = ({
  config,
  availableIntentSourceProviders,
  }) => {
  const customProviders = availableIntentSourceProviders;
  const providers =
    customProviders && customProviders.length > 0
      ? customProviders
      : DEFAULT_INTENT_SOURCE_PROVIDERS;

  const currentSource =
    config.intentSource;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.colors.primary}>
        Intent Sources ({providers.length} disponíveis)
      </Text>
      <Box flexDirection="column" marginY={0}>
        {providers.map((p) => {
          const isCurrent =
            (currentSource?.provider || 'filesystem').toLowerCase() ===
            p.toLowerCase();
          return (
            <Box key={p} gap={1}>
              <Text color={isCurrent ? theme.colors.primary : theme.colors.muted} bold={isCurrent}>
                {isCurrent ? '> ●' : '  ○'}
              </Text>
              <Text color={isCurrent ? theme.colors.primary : theme.colors.text} bold={isCurrent}>
                {p}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Box gap={1}>
          <Text color={theme.colors.text}>Projeto:</Text>
          <Text color={currentSource?.project ? theme.colors.text : theme.colors.muted}>
            {(currentSource?.project as string) || '(não configurado)'}
          </Text>
        </Box>
        <Box gap={1}>
          <Text color={theme.colors.text}>Time:</Text>
          <Text color={currentSource?.team ? theme.colors.text : theme.colors.muted}>
            {(currentSource?.team as string) || '(não configurado)'}
          </Text>
        </Box>
        <Box gap={1}>
          <Text color={theme.colors.text}>Chave API:</Text>
          <Text color={currentSource?.apiKey ? theme.colors.text : theme.colors.warning}>
            {currentSource?.apiKey
              ? typeof currentSource.apiKey === 'string' &&
                currentSource.apiKey.startsWith('$')
                ? currentSource.apiKey
                : '••••••••'
              : IntentSourceFactory.getDefaultApiKey(
                  currentSource?.provider || 'filesystem',
                )
                ? `${IntentSourceFactory.getDefaultApiKey(
                    currentSource?.provider || 'filesystem',
                  )} (padrão)`
                : '(não configurada)'}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.colors.primary} bold>
          [Enter] Configurar Intent Source
        </Text>
      </Box>
    </Box>
  );
};export default IntentSourcePreview;
