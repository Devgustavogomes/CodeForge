import React, { useState } from 'react';
import { Box } from 'ink';
import { AppContainer } from '../../../../infrastructure/container.js';
import {
  useOnboardingWizard,
  OnboardingState,
} from './hooks/useOnboardingWizard.js';
import { useOnboardingHotkeys } from './hooks/useOnboardingHotkeys.js';
import { WelcomeStep } from './steps/WelcomeStep.js';
import { SpecSourceStep } from './steps/SpecSourceStep.js';
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

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  container,
  onComplete,
  onExit,
  initialState,
  isInteractive = true,
}) => {
  const wizard = useOnboardingWizard(initialState);
  const [isFormActive, setIsFormActive] = useState(false);
  const [isOperationActive, setIsOperationActive] = useState(false);

  useOnboardingHotkeys({
    currentStep: wizard.currentStep,
    onNext: wizard.nextStep,
    onBack: wizard.previousStep,
    onExit,
    isInteractive,
    isFormActive,
    isOperationActive,
  });

  return (
    <Box flexDirection="column" width="100%" height="100%" flexGrow={1}>
      {wizard.currentStep === 'welcome' && (
        <WelcomeStep
          onStart={wizard.nextStep}
          onExit={onExit}
          isActive={false}
        />
      )}

      {wizard.currentStep === 'spec_source' && (
        <SpecSourceStep
          specSource={wizard.state.specSource}
          onChange={wizard.setSpecSource}
          onNext={wizard.nextStep}
          onFormActiveChange={setIsFormActive}
          isInteractive={isInteractive}
        />
      )}

      {wizard.currentStep === 'environment' && (
        <EnvironmentStep
          container={container}
          selectedEnvironment={wizard.state.environment}
          onChange={wizard.setEnvironment}
          onNext={wizard.nextStep}
          isInteractive={isInteractive}
        />
      )}

      {wizard.currentStep === 'agents' && (
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
        />
      )}

      {wizard.currentStep === 'cli_install' && (
        <CliInstallStep
          environment={wizard.state.environment}
          onNext={wizard.nextStep}
          onResult={wizard.setCliInstallResult}
          onInstallStart={wizard.startCliInstallation}
          onInstallingChange={wizard.setIsInstallingCli}
          onFormActiveChange={setIsFormActive}
          onOperationActiveChange={setIsOperationActive}
          isInteractive={isInteractive}
        />
      )}

      {wizard.currentStep === 'hooks' && (
        <HooksStep
          hooks={wizard.state.hooks}
          onHooksChange={wizard.setHooks}
          onNext={wizard.nextStep}
          onBack={wizard.previousStep}
          onFormActiveChange={setIsFormActive}
          isInteractive={isInteractive}
        />
      )}

      {wizard.currentStep === 'summary' && (
        <SummaryStep
          container={container}
          state={wizard.state}
          specSource={wizard.state.specSource}
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
      )}
    </Box>
  );
};

export default OnboardingWizard;
