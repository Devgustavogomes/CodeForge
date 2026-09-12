import React from 'react';
import { Box, Text } from 'ink';
import { SpecSourceFactory } from '../../../../../../infrastructure/spec-sources/SpecSourceFactory.js';
import type { ConfigPreviewProps } from '../ConfigPreview.js';
import { theme } from '../../../../theme.js';

export const DEFAULT_SPEC_SOURCE_PROVIDERS = ['filesystem', 'linear', 'github', 'clickup'];

export const SpecSourcePreview: React.FC<ConfigPreviewProps> = ({
  config,
  availableSpecSourceProviders,
}) => {
  const providers =
    availableSpecSourceProviders && availableSpecSourceProviders.length > 0
      ? availableSpecSourceProviders
      : DEFAULT_SPEC_SOURCE_PROVIDERS;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.colors.primary}>
        Spec Sources ({providers.length} disponíveis)
      </Text>
      <Box flexDirection="column" marginY={0}>
        {providers.map((p) => {
          const isCurrent =
            (config.specSource?.provider || 'filesystem').toLowerCase() ===
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
          <Text color={config.specSource?.project ? theme.colors.text : theme.colors.muted}>
            {(config.specSource?.project as string) || '(não configurado)'}
          </Text>
        </Box>
        <Box gap={1}>
          <Text color={theme.colors.text}>Time:</Text>
          <Text color={config.specSource?.team ? theme.colors.text : theme.colors.muted}>
            {(config.specSource?.team as string) || '(não configurado)'}
          </Text>
        </Box>
        <Box gap={1}>
          <Text color={theme.colors.text}>Chave API:</Text>
          <Text color={config.specSource?.apiKey ? theme.colors.text : theme.colors.warning}>
            {config.specSource?.apiKey
              ? typeof config.specSource.apiKey === 'string' &&
                config.specSource.apiKey.startsWith('$')
                ? config.specSource.apiKey
                : '••••••••'
              : SpecSourceFactory.getDefaultApiKey(
                  config.specSource?.provider || 'filesystem',
                )
                ? `${SpecSourceFactory.getDefaultApiKey(
                    config.specSource?.provider || 'filesystem',
                  )} (padrão)`
                : '(não configurada)'}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.colors.primary} bold>
          [Enter] Configurar Spec Source
        </Text>
      </Box>
    </Box>
  );
};
