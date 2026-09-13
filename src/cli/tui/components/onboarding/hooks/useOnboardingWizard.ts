import { useCallback, useState } from 'react';
import { SupportedLanguage } from '../../../../../config/types.js';
import { HookMap } from '../../../../../domain/hook.js';
import { SpecSourceConfig } from '../../../../../domain/spec-source.js';

export const ONBOARDING_STEPS = [
  'welcome',
  'spec_source',
  'environment',
  'agents',
  'cli_install',
  'hooks',
  'summary',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface CliInstallResult {
  success: boolean;
  message?: string;
}

export interface OnboardingState {
  currentStep: OnboardingStep;
  specSource: SpecSourceConfig;
  environment: string;
  plannerAgent: string;
  executorAgent: string;
  hooks: HookMap;
  isInstallingCli: boolean;
  cliInstallResult?: CliInstallResult;
  isInitializing: boolean;
  error?: string;
  language: SupportedLanguage;
}

export const INITIAL_ONBOARDING_STATE: Readonly<OnboardingState> = {
  currentStep: 'welcome',
  specSource: { provider: 'local' },
  environment: 'local',
  plannerAgent: 'default',
  executorAgent: 'default',
  hooks: {},
  isInstallingCli: false,
  isInitializing: false,
  language: 'en',
};

type StateUpdater<T> = T | ((current: T) => T);
type StatePatch = Partial<OnboardingState>;

export interface UseOnboardingWizardReturn {
  state: OnboardingState;
  currentStep: OnboardingStep;
  canGoBack: boolean;
  canGoNext: boolean;
  goToStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  previousStep: () => void;
  updateState: (patch: StatePatch | ((current: OnboardingState) => StatePatch)) => void;
  setSpecSource: (value: StateUpdater<SpecSourceConfig>) => void;
  setEnvironment: (environment: string) => void;
  setPlannerAgent: (plannerAgent: string) => void;
  setExecutorAgent: (executorAgent: string) => void;
  setAgents: (plannerAgent: string, executorAgent: string) => void;
  setHooks: (value: StateUpdater<HookMap>) => void;
  setLanguage: (language: SupportedLanguage) => void;
  setIsInstallingCli: (isInstallingCli: boolean) => void;
  setCliInstallResult: (cliInstallResult?: CliInstallResult) => void;
  startCliInstallation: () => void;
  finishCliInstallation: (result: CliInstallResult) => void;
  setIsInitializing: (isInitializing: boolean) => void;
  setError: (error?: string) => void;
  startInitialization: () => void;
  finishInitialization: (error?: string) => void;
  reset: () => void;
}

/**
 * Normalizes initial state with default values, ensuring active language defaults to 'en'.
 */
function withDefaults(initialState: Partial<OnboardingState> = {}): OnboardingState {
  const requestedStep = initialState.currentStep;
  const currentStep = requestedStep && ONBOARDING_STEPS.includes(requestedStep)
    ? requestedStep
    : 'welcome';
  const specSource = initialState.specSource ?? INITIAL_ONBOARDING_STATE.specSource;

  return {
    ...INITIAL_ONBOARDING_STATE,
    ...initialState,
    currentStep,
    specSource: {
      ...specSource,
      provider: specSource.provider || 'local',
    },
    environment: initialState.environment || 'local',
    plannerAgent: initialState.plannerAgent || 'default',
    executorAgent: initialState.executorAgent || 'default',
    hooks: initialState.hooks ?? {},
    language: initialState.language || 'en',
  };
}

/**
 * Creates the initial onboarding wizard state.
 */
export function createInitialOnboardingState(
  initialState: Partial<OnboardingState> = {},
): OnboardingState {
  return withDefaults(initialState);
}

/**
 * Custom hook managing the state and transitions of the Onboarding Wizard.
 */
export function useOnboardingWizard(
  initialState: Partial<OnboardingState> = {},
): UseOnboardingWizardReturn {
  const [state, setState] = useState<OnboardingState>(() => withDefaults(initialState));

  const updateState = useCallback(
    (patch: StatePatch | ((current: OnboardingState) => StatePatch)) => {
      setState((current) => ({
        ...current,
        ...(typeof patch === 'function' ? patch(current) : patch),
      }));
    },
    [],
  );

  const goToStep = useCallback((step: OnboardingStep) => {
    updateState({ currentStep: step });
  }, [updateState]);

  const nextStep = useCallback(() => {
    updateState((current) => {
      const index = ONBOARDING_STEPS.indexOf(current.currentStep);
      return {
        currentStep: ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)],
      };
    });
  }, [updateState]);

  const previousStep = useCallback(() => {
    updateState((current) => {
      const index = ONBOARDING_STEPS.indexOf(current.currentStep);
      return { currentStep: ONBOARDING_STEPS[Math.max(index - 1, 0)] };
    });
  }, [updateState]);

  const setSpecSource = useCallback((value: StateUpdater<SpecSourceConfig>) => {
    setState((current) => {
      const specSource = typeof value === 'function' ? value(current.specSource) : value;
      return {
        ...current,
        specSource: { ...specSource, provider: specSource.provider || 'local' },
      };
    });
  }, []);

  const setEnvironment = useCallback((environment: string) => {
    updateState({ environment: environment || 'local' });
  }, [updateState]);

  const setPlannerAgent = useCallback((plannerAgent: string) => {
    updateState({ plannerAgent: plannerAgent || 'default' });
  }, [updateState]);

  const setExecutorAgent = useCallback((executorAgent: string) => {
    updateState({ executorAgent: executorAgent || 'default' });
  }, [updateState]);

  const setAgents = useCallback((plannerAgent: string, executorAgent: string) => {
    updateState({
      plannerAgent: plannerAgent || 'default',
      executorAgent: executorAgent || 'default',
    });
  }, [updateState]);

  const setHooks = useCallback((value: StateUpdater<HookMap>) => {
    setState((current) => ({
      ...current,
      hooks: typeof value === 'function' ? value(current.hooks) : value,
    }));
  }, []);

  const setLanguage = useCallback((language: SupportedLanguage) => {
    updateState({ language: language || 'en' });
  }, [updateState]);

  const setIsInstallingCli = useCallback((isInstallingCli: boolean) => {
    updateState({ isInstallingCli });
  }, [updateState]);

  const setCliInstallResult = useCallback((cliInstallResult?: CliInstallResult) => {
    updateState({ cliInstallResult });
  }, [updateState]);

  const startCliInstallation = useCallback(() => {
    updateState({ isInstallingCli: true, cliInstallResult: undefined, error: undefined });
  }, [updateState]);

  const finishCliInstallation = useCallback((result: CliInstallResult) => {
    updateState({
      isInstallingCli: false,
      cliInstallResult: result,
      error: result.success ? undefined : result.message,
    });
  }, [updateState]);

  const setIsInitializing = useCallback((isInitializing: boolean) => {
    updateState({ isInitializing });
  }, [updateState]);

  const setError = useCallback((error?: string) => {
    updateState({ error });
  }, [updateState]);

  const startInitialization = useCallback(() => {
    updateState({ isInitializing: true, error: undefined });
  }, [updateState]);

  const finishInitialization = useCallback((error?: string) => {
    updateState({ isInitializing: false, error });
  }, [updateState]);

  const reset = useCallback(() => {
    setState(withDefaults(initialState));
  }, [initialState]);

  const currentStepIndex = ONBOARDING_STEPS.indexOf(state.currentStep);

  return {
    state,
    currentStep: state.currentStep,
    canGoBack: currentStepIndex > 0,
    canGoNext: currentStepIndex < ONBOARDING_STEPS.length - 1,
    goToStep,
    nextStep,
    previousStep,
    updateState,
    setSpecSource,
    setEnvironment,
    setPlannerAgent,
    setExecutorAgent,
    setAgents,
    setHooks,
    setLanguage,
    setIsInstallingCli,
    setCliInstallResult,
    startCliInstallation,
    finishCliInstallation,
    setIsInitializing,
    setError,
    startInitialization,
    finishInitialization,
    reset,
  };
}

export default useOnboardingWizard;
