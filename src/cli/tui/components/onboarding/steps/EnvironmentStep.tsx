import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { SupportedLanguage } from '../../../../../config/types.js';
import { AppContainer } from '../../../../../infrastructure/container.js';
import { translate } from '../../../../ui/i18n.js';
import { theme } from '../../../theme.js';

export interface EnvironmentStepProps {
  container: AppContainer;
  environment?: string;
  selectedEnvironment?: string;
  onChange?: (environment: string) => void;
  onEnvironmentChange?: (environment: string) => void;
  onSelect?: (environment: string) => void;
  onConfirm?: (environment: string) => void;
  onNext?: () => void;
  isInteractive?: boolean;
  language?: SupportedLanguage;
}

export interface EnvironmentInfo {
  description: string;
  requirements: string;
  advantages: string;
}

/**
 * The infrastructure only exposes runner identifiers.
 * The info card describes the common contract for any runner without inferring specific capabilities.
 */
export function createEnvironmentInfo(
  environment: string,
  language: SupportedLanguage = 'en',
): EnvironmentInfo {
  return {
    description: translate('onboarding_env_card_description', language, { environment }),
    requirements: translate('onboarding_env_card_requirements', language, { environment }),
    advantages: translate('onboarding_env_card_advantages', language),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const EnvironmentStep: React.FC<EnvironmentStepProps> = ({
  container,
  environment,
  selectedEnvironment,
  onChange,
  onEnvironmentChange,
  onSelect,
  onConfirm,
  onNext,
  isInteractive = true,
  language = 'en',
}) => {
  const currentEnvironment = selectedEnvironment ?? environment ?? '';
  const environmentResult = useMemo<{
    environments: string[];
    error: string | undefined;
  }>(() => {
    try {
      return {
        environments:
          container.configureEnvironmentUseCase.getAvailableEnvironments() ?? [],
        error: undefined,
      };
    } catch (error: unknown) {
      return { environments: [], error: errorMessage(error) };
    }
  }, [container]);

  const { environments, error } = environmentResult;
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const initialIndex = environments.indexOf(currentEnvironment);
    return initialIndex >= 0 ? initialIndex : 0;
  });

  useEffect(() => {
    const storedIndex = environments.indexOf(currentEnvironment);
    setSelectedIndex((previous) => {
      if (storedIndex >= 0) return storedIndex;
      return Math.min(previous, Math.max(environments.length - 1, 0));
    });
  }, [currentEnvironment, environments]);

  useInput(
    (_input, key) => {
      if (environments.length === 0) return;

      if (key.upArrow) {
        setSelectedIndex((index) =>
          (index - 1 + environments.length) % environments.length,
        );
        return;
      }

      if (key.downArrow) {
        setSelectedIndex((index) => (index + 1) % environments.length);
        return;
      }

      if (key.return) {
        const selected = environments[selectedIndex];
        if (!selected) return;
        onChange?.(selected);
        onEnvironmentChange?.(selected);
        onSelect?.(selected);
        onConfirm?.(selected);
        onNext?.();
      }
    },
    { isActive: isInteractive },
  );

  const selected = environments[selectedIndex];
  const info = selected ? createEnvironmentInfo(selected, language) : undefined;

  return (
    <Box flexDirection="column" width="100%" gap={1}>
      <Box flexDirection="column">
        <Text bold color={theme.colors.primary}>
          {translate('onboarding_env_title', language)}
        </Text>
        <Text color={theme.colors.text}>
          {translate('onboarding_env_description', language)}
        </Text>
        <Text color={theme.colors.muted}>
          {translate('onboarding_env_isolation_note', language)}
        </Text>
      </Box>

      {error ? (
        <Box borderStyle="round" borderColor={theme.colors.error} paddingX={1}>
          <Text color={theme.colors.error}>
            {translate('onboarding_env_load_error', language, { error })}
          </Text>
        </Box>
      ) : environments.length === 0 ? (
        <Box borderStyle="round" borderColor={theme.colors.warning} paddingX={1}>
          <Text color={theme.colors.warning}>
            {translate('onboarding_env_no_environments', language)}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text bold color={theme.colors.text}>
            {translate('onboarding_env_choose_runner', language)}
          </Text>
          {environments.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={`${item}-${index}`} gap={1}>
                <Text color={isSelected ? theme.colors.primary : theme.colors.muted} bold={isSelected}>
                  {isSelected ? '[>]' : '   '}
                </Text>
                <Text color={isSelected ? theme.colors.primary : theme.colors.text} bold={isSelected}>
                  {item}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {selected && info ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.colors.borderActive}
          paddingX={1}
        >
          <Text bold color={theme.colors.accent}>{selected}</Text>
          <Text>
            <Text bold>{translate('onboarding_env_label_description', language)}</Text>
            {info.description}
          </Text>
          <Text>
            <Text bold color={theme.colors.warning}>{translate('onboarding_env_label_requirements', language)}</Text>
            {info.requirements}
          </Text>
          <Text>
            <Text bold color={theme.colors.success}>{translate('onboarding_env_label_advantages', language)}</Text>
            {info.advantages}
          </Text>
        </Box>
      ) : null}

      <Text color={theme.colors.muted}>
        {translate('onboarding_env_nav_hint', language)}
      </Text>
    </Box>
  );
};

export default EnvironmentStep;
