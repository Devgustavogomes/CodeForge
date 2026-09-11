import React from 'react';
import { Box, Text } from 'ink';
import { SpecSourceFactory } from '../../../../../../infrastructure/spec-sources/SpecSourceFactory.js';
import type { ConfigPreviewProps } from '../ConfigPreview.js';

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
      <Text bold color="cyan">
        Spec Sources ({providers.length} disponíveis)
      </Text>
      <Box flexDirection="column" marginY={0}>
        {providers.map((p) => {
          const isCurrent =
            (config.specSource?.provider || 'filesystem').toLowerCase() ===
            p.toLowerCase();
          return (
            <Box key={p} gap={1}>
              <Text color={isCurrent ? 'cyan' : 'gray'} bold={isCurrent}>
                {isCurrent ? '❯ ●' : '  ○'}
              </Text>
              <Text color={isCurrent ? 'cyan' : 'white'} bold={isCurrent}>
                {p}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Box gap={1}>
          <Text color="white">Projeto:</Text>
          <Text color={config.specSource?.project ? 'white' : 'gray'}>
            {(config.specSource?.project as string) || '(não configurado)'}
          </Text>
        </Box>
        <Box gap={1}>
          <Text color="white">Time:</Text>
          <Text color={config.specSource?.team ? 'white' : 'gray'}>
            {(config.specSource?.team as string) || '(não configurado)'}
          </Text>
        </Box>
        <Box gap={1}>
          <Text color="white">Chave API:</Text>
          <Text color={config.specSource?.apiKey ? 'white' : 'yellow'}>
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
        <Text color="cyan" bold>
          [Enter] Configurar Spec Source
        </Text>
      </Box>
    </Box>
  );
};