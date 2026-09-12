import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { SpecSourceConfig } from '../../../../../domain/spec-source.js';
import { SpecSourceFactory } from '../../../../../infrastructure/spec-sources/SpecSourceFactory.js';
import { theme } from '../../../theme.js';
import { SpecSourceForm, SpecSourceFormField } from '../../config/components/SpecSourceForm.js';
import { useConfigureSpecSourceModal } from '../../config/hooks/useConfigureSpecSourceModal.js';

const REMOTE_FORM_FIELDS: SpecSourceFormField[] = ['project', 'team', 'apiKey', 'save'];

export const ONBOARDING_SPEC_SOURCE_PROVIDERS = [
  {
    provider: 'filesystem',
    label: 'Local',
    detail: 'Filesystem — .codeforge/specs/',
    description: 'Specs em Markdown versionadas junto ao projeto.',
    recommended: true,
  },
  {
    provider: 'github',
    label: 'GitHub',
    detail: 'Issues / Projects',
    description: 'Use issues do repositório como origem dos requisitos.',
    recommended: false,
  },
  {
    provider: 'linear',
    label: 'Linear',
    detail: 'Issues e histórias',
    description: 'Sincronize o backlog do seu time no Linear.',
    recommended: false,
  },
  {
    provider: 'clickup',
    label: 'ClickUp',
    detail: 'Tarefas e requisitos',
    description: 'Importe tarefas de uma lista do ClickUp.',
    recommended: false,
  },
] as const;

export interface SpecSourceStepProps {
  specSource: SpecSourceConfig;
  onChange: (specSource: SpecSourceConfig) => void;
  onNext: () => void;
  onFormActiveChange?: (isActive: boolean) => void;
  isInteractive?: boolean;
}

function providerIndex(provider: string): number {
  const normalized = provider.toLowerCase() === 'local' ? 'filesystem' : provider.toLowerCase();
  const index = ONBOARDING_SPEC_SOURCE_PROVIDERS.findIndex(
    (option) => option.provider === normalized,
  );
  return index >= 0 ? index : 0;
}

export const SpecSourceStep: React.FC<SpecSourceStepProps> = ({
  specSource,
  onChange,
  onNext,
  onFormActiveChange,
  isInteractive = true,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(() => providerIndex(specSource.provider));
  const [isFormActive, setIsFormActive] = useState(false);
  const [draftSource, setDraftSource] = useState<SpecSourceConfig>(() => ({ ...specSource }));
  const selectedOption = ONBOARDING_SPEC_SOURCE_PROVIDERS[selectedIndex];

  const formConfig = useMemo<CodeForgeConfig>(
    () => ({
      environment: 'local',
      plannerAgent: 'default',
      executorAgent: 'default',
      language: 'pt',
      specSource: draftSource,
    }),
    [draftSource],
  );

  const closeForm = useCallback(() => setIsFormActive(false), []);
  const commitRemoteSource = useCallback(
    (nextSource: SpecSourceConfig) => {
      setDraftSource(nextSource);
      onChange(nextSource);
      setIsFormActive(false);
      onNext();
    },
    [onChange, onNext],
  );

  const form = useConfigureSpecSourceModal({
    isOpen: isFormActive,
    onClose: closeForm,
    config: formConfig,
    onUpdateSpecSource: commitRemoteSource,
    availableProviders: [selectedOption.provider],
    formFields: REMOTE_FORM_FIELDS,
  });

  useEffect(() => {
    onFormActiveChange?.(isFormActive);
    return () => onFormActiveChange?.(false);
  }, [isFormActive, onFormActiveChange]);

  const confirmSelection = useCallback(() => {
    if (selectedOption.provider === 'filesystem') {
      const localSource: SpecSourceConfig = { provider: 'filesystem' };
      setDraftSource(localSource);
      onChange(localSource);
      onNext();
      return;
    }

    const sourceForProvider: SpecSourceConfig =
      specSource.provider.toLowerCase() === selectedOption.provider
        ? { ...specSource }
        : {
            provider: selectedOption.provider,
            apiKey: SpecSourceFactory.getDefaultApiKey(selectedOption.provider),
          };
    setDraftSource(sourceForProvider);
    setIsFormActive(true);
  }, [onChange, onNext, selectedOption, specSource]);

  useInput(
    (input, key) => {
      if (isFormActive) return;

      if (key.upArrow || input.toLowerCase() === 'k') {
        setSelectedIndex((current) =>
          (current - 1 + ONBOARDING_SPEC_SOURCE_PROVIDERS.length) %
          ONBOARDING_SPEC_SOURCE_PROVIDERS.length,
        );
        return;
      }

      if (key.downArrow || input.toLowerCase() === 'j') {
        setSelectedIndex((current) =>
          (current + 1) % ONBOARDING_SPEC_SOURCE_PROVIDERS.length,
        );
        return;
      }

      const numericIndex = Number(input) - 1;
      if (numericIndex >= 0 && numericIndex < ONBOARDING_SPEC_SOURCE_PROVIDERS.length) {
        setSelectedIndex(numericIndex);
        return;
      }

      if (key.return || input === '\r' || input === '\n') {
        confirmSelection();
      }
    },
    { isActive: isInteractive && !isFormActive },
  );

  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.colors.primary}>Fonte das especificações</Text>
        <Text color={theme.colors.text}>
          Specs são os requisitos e histórias que os agentes transformam em planos e código.
        </Text>
        <Text color={theme.colors.muted}>
          Escolha onde o CodeForge deve encontrá-las. Nada será salvo no config.yaml agora.
        </Text>
      </Box>

      {!isFormActive ? (
        <Box flexDirection="column">
          {ONBOARDING_SPEC_SOURCE_PROVIDERS.map((option, index) => {
            const isSelected = selectedIndex === index;
            return (
              <Box key={option.provider} flexDirection="column" marginBottom={1}>
                <Box gap={1}>
                  <Text color={isSelected ? theme.colors.primary : theme.colors.muted} bold>
                    {isSelected ? '›' : ' '} [{index + 1}]
                  </Text>
                  <Text color={isSelected ? theme.colors.primary : theme.colors.text} bold={isSelected}>
                    {option.label}
                  </Text>
                  <Text color={theme.colors.muted}>({option.detail})</Text>
                  {option.recommended && <Text color={theme.colors.success} bold>RECOMENDADO</Text>}
                </Box>
                {isSelected && <Box paddingLeft={6}><Text color={theme.colors.muted}>{option.description}</Text></Box>}
              </Box>
            );
          })}

          <Box borderStyle="single" borderColor={theme.colors.borderSubtle} paddingX={1}>
            <Text color={theme.colors.muted}>[↑/↓ ou j/k] Navegar  [1–4] Selecionar  [Enter] Confirmar</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.primary} paddingX={1}>
          <Box gap={1} marginBottom={1}>
            <Text color={theme.colors.primary} bold>{selectedOption.label}</Text>
            <Text color={theme.colors.muted}>— configure a conexão</Text>
          </Box>
          <SpecSourceForm
            activeField={form.activeFormField}
            activeFieldIndex={form.activeFormFieldIndex}
            provider={form.provider}
            project={form.project}
            team={form.team}
            apiKey={form.apiKey}
            availableProviders={[selectedOption.provider]}
            errorMessage={form.formErrorMessage}
            showProviderField={false}
            submitLabel="Usar esta fonte"
          />
        </Box>
      )}
    </Box>
  );
};

export default SpecSourceStep;
