import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  CodeForgeConfig,
  SupportedLanguage,
} from "../../../../../config/types.js";
import { IntentSourceConfig } from "../../../../../domain/intent-source.js";
import { IntentSourceFactory } from "../../../../../infrastructure/intent-sources/IntentSourceFactory.js";
import { translate, TranslationKey } from "../../../../ui/i18n.js";
import { theme } from "../../../theme.js";
import {
  IntentSourceForm,
  IntentSourceFormField,
} from "../../config/components/IntentSourceForm.js";
import { useConfigureIntentSourceModal } from "../../config/hooks/useConfigureIntentSourceModal.js";

const REMOTE_FORM_FIELDS: IntentSourceFormField[] = [
  "project",
  "team",
  "apiKey",
  "save",
];

export interface OnboardingIntentSourceOption {
  provider: "filesystem" | "github" | "linear" | "clickup";
  labelKey: TranslationKey;
  detailKey: TranslationKey;
  descriptionKey: TranslationKey;
  label: string;
  detail: string;
  description: string;
  recommended: boolean;
}
export const ONBOARDING_INTENT_SOURCE_PROVIDERS: readonly OnboardingIntentSourceOption[] =
  [
    {
      provider: "filesystem",
      labelKey: "onboarding_intent_source_provider_filesystem_label",
      detailKey: "onboarding_intent_source_provider_filesystem_detail",
      descriptionKey: "onboarding_intent_source_provider_filesystem_desc",
      label: "Local",
      detail: "Filesystem — .codeforge/intents/",
      description: "Intents em Markdown versionadas junto ao projeto.",
      recommended: true,
    },
    {
      provider: "github",
      labelKey: "onboarding_intent_source_provider_github_label",
      detailKey: "onboarding_intent_source_provider_github_detail",
      descriptionKey: "onboarding_intent_source_provider_github_desc",
      label: "GitHub",
      detail: "Issues / Projects",
      description: "Use issues do repositório como origem dos requisitos.",
      recommended: false,
    },
    {
      provider: "linear",
      labelKey: "onboarding_intent_source_provider_linear_label",
      detailKey: "onboarding_intent_source_provider_linear_detail",
      descriptionKey: "onboarding_intent_source_provider_linear_desc",
      label: "Linear",
      detail: "Issues e histórias",
      description: "Sincronize o backlog do seu time no Linear.",
      recommended: false,
    },
    {
      provider: "clickup",
      labelKey: "onboarding_intent_source_provider_clickup_label",
      detailKey: "onboarding_intent_source_provider_clickup_detail",
      descriptionKey: "onboarding_intent_source_provider_clickup_desc",
      label: "ClickUp",
      detail: "Tarefas e requisitos",
      description: "Importe tarefas de uma lista do ClickUp.",
      recommended: false,
    },
  ] as const;
export interface IntentSourceStepProps {
  intentSource?: IntentSourceConfig;  onChange: (source: IntentSourceConfig) => void;
  onNext: () => void;
  onFormActiveChange?: (isActive: boolean) => void;
  isInteractive?: boolean;
  language?: SupportedLanguage;
}
function providerIndex(provider: string): number {
  const normalized =
    provider.toLowerCase() === "local" ? "filesystem" : provider.toLowerCase();
  const index = ONBOARDING_INTENT_SOURCE_PROVIDERS.findIndex(
    (option) => option.provider === normalized,
  );
  return index >= 0 ? index : 0;
}

export const IntentSourceStep: React.FC<IntentSourceStepProps> = ({
  intentSource,
    onChange,
  onNext,
  onFormActiveChange,
  isInteractive = true,
  language = "en",
}) => {
  const effectiveSource = intentSource ?? { provider: "filesystem" };
  const [selectedIndex, setSelectedIndex] = useState(() =>
    providerIndex(effectiveSource.provider),
  );
  const [isFormActive, setIsFormActive] = useState(false);
  const [draftSource, setDraftSource] = useState<IntentSourceConfig>(() => ({
    ...effectiveSource,
  }));
  const selectedOption = ONBOARDING_INTENT_SOURCE_PROVIDERS[selectedIndex];

  const formConfig = useMemo<CodeForgeConfig>(
    () => ({
      environment: "local",
      plannerAgent: "default",
      executorAgent: "default",
      language,
      intentSource: draftSource,
    }),
    [draftSource, language],
  );

  const closeForm = useCallback(() => setIsFormActive(false), []);
  const commitRemoteSource = useCallback(
    (nextSource: IntentSourceConfig) => {
      setDraftSource(nextSource);
      onChange(nextSource);
      setIsFormActive(false);
      onNext();
    },
    [onChange, onNext],
  );

  const form = useConfigureIntentSourceModal({
    isOpen: isFormActive,
    onClose: closeForm,
    config: formConfig,
    onUpdateIntentSource: commitRemoteSource,
    availableProviders: [selectedOption.provider],
    formFields: REMOTE_FORM_FIELDS,
  });

  useEffect(() => {
    onFormActiveChange?.(isFormActive);
    return () => onFormActiveChange?.(false);
  }, [isFormActive, onFormActiveChange]);

  const confirmSelection = useCallback(() => {
    if (selectedOption.provider === "filesystem") {
      const localSource: IntentSourceConfig = { provider: "filesystem" };
      setDraftSource(localSource);
      onChange(localSource);
      onNext();
      return;
    }

    const sourceForProvider: IntentSourceConfig =
      effectiveSource.provider.toLowerCase() === selectedOption.provider
        ? { ...effectiveSource }
        : {
            provider: selectedOption.provider,
            apiKey: IntentSourceFactory.getDefaultApiKey(selectedOption.provider),
          };
    setDraftSource(sourceForProvider);
    setIsFormActive(true);
  }, [onChange, onNext, selectedOption, effectiveSource]);

  useInput(
    (input, key) => {
      if (isFormActive) return;

      if (key.upArrow || input.toLowerCase() === "k") {
        setSelectedIndex(
          (current) =>
            (current - 1 + ONBOARDING_INTENT_SOURCE_PROVIDERS.length) %
            ONBOARDING_INTENT_SOURCE_PROVIDERS.length,
        );
        return;
      }

      if (key.downArrow || input.toLowerCase() === "j") {
        setSelectedIndex(
          (current) => (current + 1) % ONBOARDING_INTENT_SOURCE_PROVIDERS.length,
        );
        return;
      }

      const numericIndex = Number(input) - 1;
      if (
        numericIndex >= 0 &&
        numericIndex < ONBOARDING_INTENT_SOURCE_PROVIDERS.length
      ) {
        setSelectedIndex(numericIndex);
        return;
      }

      if (key.return || input === "\r" || input === "\n") {
        confirmSelection();
      }
    },
    { isActive: isInteractive && !isFormActive },
  );

  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.colors.primary}>
          {translate("onboarding_intent_source_title", language)}
        </Text>
        <Text color={theme.colors.text}>
          {translate("onboarding_intent_source_description", language)}
        </Text>
        <Text color={theme.colors.muted}>
          {translate("onboarding_intent_source_note", language)}
        </Text>
      </Box>

      {!isFormActive ? (
        <Box flexDirection="column">
          {ONBOARDING_INTENT_SOURCE_PROVIDERS.map((option, index) => {
            const isSelected = selectedIndex === index;
            const label = translate(option.labelKey, language);
            const detail = translate(option.detailKey, language);
            const description = translate(option.descriptionKey, language);

            return (
              <Box
                key={option.provider}
                flexDirection="column"
                marginBottom={1}
              >
                <Box gap={1}>
                  <Text
                    color={
                      isSelected ? theme.colors.primary : theme.colors.muted
                    }
                    bold
                  >
                    {isSelected ? "[>]" : "   "} [{index + 1}]
                  </Text>
                  <Text
                    color={
                      isSelected ? theme.colors.primary : theme.colors.text
                    }
                    bold={isSelected}
                  >
                    {label}
                  </Text>
                  <Text color={theme.colors.muted}>({detail})</Text>
                  {option.recommended && (
                    <Text color={theme.colors.success} bold>
                      {translate(
                        "onboarding_intent_source_recommended",
                        language,
                      )}
                    </Text>
                  )}
                </Box>
                {isSelected && (
                  <Box paddingLeft={8}>
                    <Text color={theme.colors.muted}>{description}</Text>
                  </Box>
                )}
              </Box>
            );
          })}

          <Box
            borderStyle="single"
            borderColor={theme.colors.borderSubtle}
            paddingX={1}
          >
            <Text color={theme.colors.muted}>
              {translate("onboarding_intent_source_nav_hint", language)}
            </Text>
          </Box>
        </Box>
      ) : (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.colors.primary}
          paddingX={1}
        >
          <Box gap={1} marginBottom={1}>
            <Text color={theme.colors.primary} bold>
              {translate(selectedOption.labelKey, language)}
            </Text>
            <Text color={theme.colors.muted}>
              {translate("onboarding_intent_source_config_subtitle", language)}
            </Text>
          </Box>
          <IntentSourceForm
            activeField={form.activeFormField}
            activeFieldIndex={form.activeFormFieldIndex}
            provider={form.provider}
            project={form.project}
            team={form.team}
            apiKey={form.apiKey}
            availableProviders={[selectedOption.provider]}
            errorMessage={form.formErrorMessage}
            showProviderField={false}
            submitLabel={translate(
              "onboarding_intent_source_submit_label",
              language,
            )}
          />
        </Box>
      )}
    </Box>
  );
};export default IntentSourceStep;
