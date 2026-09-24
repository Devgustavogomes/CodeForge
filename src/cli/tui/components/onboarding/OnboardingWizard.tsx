import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { AppContainer } from '../../../../infrastructure/container.js';
import { SupportedLanguage } from '../../../../config/types.js';
import { translate, TranslationKey } from '../../../ui/i18n.js';
import { theme } from '../../theme.js';
import { StatusBar } from '../common/StatusBar.js';
import {
  useOnboardingWizard,
  OnboardingState,
  OnboardingStep,
} from './hooks/useOnboardingWizard.js';
import { useOnboardingHotkeys } from './hooks/useOnboardingHotkeys.js';
import { WelcomeStep } from './steps/WelcomeStep.js';
import { IntentSourceStep } from './steps/IntentSourceStep.js';
import { EnvironmentStep } from './steps/EnvironmentStep.js';
import { AgentsStep } from './steps/AgentsStep.js';
import { CliInstallStep } from './steps/CliInstallStep.js';
import { HooksStep } from './steps/HooksStep.js';
import { SummaryStep } from './steps/SummaryStep.js';

export interface OnboardingWizardProps {
  container: AppContainer;
  onComplete: () => void;
  onExit: () => void;
  initialState?: Partial<OnboardingState>;
  isInteractive?: boolean;
}

interface WizardStepDefinition {
  id: OnboardingStep;
  numberKey: string;
  labelKey: TranslationKey;
  defaultLabel: string;
}

/**
 * Definition of the 6 subsequent onboarding steps displayed in the top step bar.
 * Matches the TUI TabBar visual style: [1] Source [2] Environment [3] CLI [4] Agents [5] Hooks [6] Summary.
 */
const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  { id: 'intent_source', numberKey: '1', labelKey: 'onboarding_step_source', defaultLabel: 'Source' },
  { id: 'environment', numberKey: '2', labelKey: 'onboarding_step_environment', defaultLabel: 'Environment' },
  { id: 'cli_install', numberKey: '3', labelKey: 'onboarding_step_cli', defaultLabel: 'CLI' },
  { id: 'agents', numberKey: '4', labelKey: 'onboarding_step_agents', defaultLabel: 'Agents' },
  { id: 'hooks', numberKey: '5', labelKey: 'onboarding_step_hooks', defaultLabel: 'Hooks' },
  { id: 'summary', numberKey: '6', labelKey: 'onboarding_step_summary', defaultLabel: 'Summary' },
] as const;

/**
 * OnboardingWizard component that guides users through initial project configuration.
 * - Step 1 (Welcome): Standalone splash screen without step bar or bottom status bar.
 * - Steps 2 to 7: Framed with top Wizard Step Bar, rounded central content container, and bottom StatusBar.
 */
export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  container,
  onComplete,
  onExit,
  initialState,
  isInteractive = true,
}) => {
  const resolvedLanguage = useMemo<SupportedLanguage>(() => {
    if (initialState?.language) {
      return initialState.language;
    }
    try {
      const config = container?.configService?.loadConfig();
      if (config?.language) {
        return config.language;
      }
    } catch {
      // Configuration file might not exist or be invalid yet
    }
    return 'en';
  }, [initialState?.language, container]);

  const effectiveInitialState = useMemo(
    () => ({
      language: resolvedLanguage,
      ...initialState,
    }),
    [resolvedLanguage, initialState],
  );

  const wizard = useOnboardingWizard(effectiveInitialState);
  const [isFormActive, setIsFormActive] = useState(false);
  const [isOperationActive, setIsOperationActive] = useState(false);

  // Reset form and operation locks whenever the active wizard step changes
  useEffect(() => {
    setIsFormActive(false);
    setIsOperationActive(false);
  }, [wizard.currentStep]);

  useOnboardingHotkeys({
    currentStep: wizard.currentStep,
    onNext: wizard.nextStep,
    onBack: wizard.previousStep,
    onExit,
    isInteractive,
    isFormActive,
    isOperationActive,
  });

  const currentLanguage: SupportedLanguage = wizard.state.language ?? 'en';

  const statusHints = useMemo(
    () => translate('onboarding_status_hints', currentLanguage),
    [currentLanguage],
  );

  const renderStepContent = useCallback(() => {
    switch (wizard.currentStep) {
      case 'intent_source':
        return (
          <IntentSourceStep
            intentSource={wizard.state.intentSource}
            onChange={wizard.setIntentSource}
            onNext={wizard.nextStep}
            onFormActiveChange={setIsFormActive}
            isInteractive={isInteractive}
            language={currentLanguage}
          />
        );
      case 'environment':
        return (
          <EnvironmentStep
            container={container}
            selectedEnvironment={wizard.state.environment}
            onChange={wizard.setEnvironment}
            onNext={wizard.nextStep}
            isInteractive={isInteractive}
            language={currentLanguage}
          />
        );
      case 'agents':
        return (
          <AgentsStep
            container={container}
            environment={wizard.state.environment}
            plannerAgent={wizard.state.plannerAgent}
            executorAgent={wizard.state.executorAgent}
            onChange={wizard.setAgents}
            onNext={wizard.nextStep}
            onBack={wizard.previousStep}
            onFormActiveChange={setIsFormActive}
            isInteractive={isInteractive}
            language={currentLanguage}
          />
        );
      case 'cli_install':
        return (
          <CliInstallStep
            environment={wizard.state.environment}
            onNext={wizard.nextStep}
            onResult={wizard.setCliInstallResult}
            onInstallStart={wizard.startCliInstallation}
            onInstallingChange={wizard.setIsInstallingCli}
            onFormActiveChange={setIsFormActive}
            onOperationActiveChange={setIsOperationActive}
            isInteractive={isInteractive}
            language={currentLanguage}
          />
        );
      case 'hooks':
        return (
          <HooksStep
            hooks={wizard.state.hooks}
            onHooksChange={wizard.setHooks}
            onNext={wizard.nextStep}
            onBack={wizard.previousStep}
            onFormActiveChange={setIsFormActive}
            isInteractive={isInteractive}
            language={currentLanguage}
          />
        );
      case 'summary':
        return (
          <SummaryStep
            container={container}
            state={wizard.state}
            intentSource={wizard.state.intentSource}
            environment={wizard.state.environment}
            plannerAgent={wizard.state.plannerAgent}
            executorAgent={wizard.state.executorAgent}
            hooks={wizard.state.hooks}
            cliInstallResult={wizard.state.cliInstallResult}
            isInitializing={wizard.state.isInitializing}
            error={wizard.state.error}
            onComplete={onComplete}
            onBack={wizard.previousStep}
            onStartInitialization={wizard.startInitialization}
            onFinishInitialization={wizard.finishInitialization}
            onInitializingChange={wizard.setIsInitializing}
            onErrorChange={wizard.setError}
            onFormActiveChange={setIsFormActive}
            onOperationActiveChange={setIsOperationActive}
            isInteractive={isInteractive}
          />
        );
      default:
        return null;
    }
  }, [
    container,
    currentLanguage,
    isInteractive,
    onComplete,
    wizard.currentStep,
    wizard.finishInitialization,
    wizard.nextStep,
    wizard.previousStep,
    wizard.setAgents,
    wizard.setCliInstallResult,
    wizard.setEnvironment,
    wizard.setError,
    wizard.setHooks,
    wizard.setIsInitializing,
    wizard.setIsInstallingCli,
    wizard.setIntentSource,
    wizard.startCliInstallation,
    wizard.startInitialization,
    wizard.state,
  ]);

  // Step 1: Render standalone WelcomeStep splash screen without top step bar or bottom status bar
  if (wizard.currentStep === 'welcome') {
    return (
      <Box flexDirection="column" width="100%" height="100%" flexGrow={1}>
        <WelcomeStep
          onStart={wizard.nextStep}
          onExit={onExit}
          isActive={false}
          language={currentLanguage}
        />
      </Box>
    );
  }

  // Steps 2 to 7: Render top Wizard Step Bar, rounded content container, and bottom StatusBar
  return (
    <Box flexDirection="column" width="100%">
      {/* Wizard Step Bar at top */}
      <Box
        borderStyle="round"
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
        gap={1}
        width="100%"
        flexShrink={0}
      >
        {WIZARD_STEPS.map((step) => {
          const isActive = step.id === wizard.currentStep;
          const label = translate(step.labelKey, currentLanguage);
          return (
            <Text
              key={step.id}
              bold={isActive}
              underline={isActive}
              color={isActive ? theme.colors.primary : theme.colors.muted}
            >
              {` [${step.numberKey}] ${label} `}
            </Text>
          );
        })}
      </Box>

      {/* Active step content container */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
        flexGrow={1}
        width="100%"
        overflow="hidden"
      >
        {renderStepContent()}
      </Box>

      {/* Bottom StatusBar with contextual navigation hints */}
      <StatusBar
        hints={statusHints}
        borderStyle="none"
        borderColor={theme.colors.borderSubtle}
        error={wizard.state.error}
      />
    </Box>
  );
};

export default OnboardingWizard;
