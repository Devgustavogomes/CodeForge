import { useCallback, useState } from 'react';
import { SupportedLanguage } from '../../../../../config/types.js';
import { HookMap } from '../../../../../domain/hook.js';
import { IntentSourceConfig, } from '../../../../../domain/intent-source.js';

export const ONBOARDING_STEPS = [
  'welcome',
  'intent_source',
  'environment',
  'cli_install',
  'agents',
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
  intentSource: IntentSourceConfig;  environment: string;
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
  intentSource: { provider: 'local' },
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
  setIntentSource: (value: StateUpdater<IntentSourceConfig>) => void;  setEnvironment: (environment: string) => void;
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
  const normalizedStep = requestedStep;
  const currentStep = normalizedStep && (ONBOARDING_STEPS as readonly string[]).includes(normalizedStep)
    ? (normalizedStep as OnboardingStep)
    : 'welcome';
  const source = initialState.intentSource ?? INITIAL_ONBOARDING_STATE.intentSource;

  return {
    ...INITIAL_ONBOARDING_STATE,
    ...initialState,
    currentStep,
    intentSource: {
      ...source,
      provider: source.provider || 'local',
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
      setState((current) => {
        const next = typeof patch === 'function' ? patch(current) : patch;
        const nextSource = next.intentSource;
        return {
          ...current,
          ...next,
          ...(nextSource ? { intentSource: nextSource,} : {}),
        };
      });
    },
    [],
  );

  const goToStep = useCallback((step: OnboardingStep) => {
    updateState({ currentStep: step });
  }, [updateState]);

  const nextStep = useCallback(() => {
    updateState((current) => {
      const active = current.currentStep;
      const index = (ONBOARDING_STEPS as readonly string[]).indexOf(active);
      return {
        currentStep: ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)],
      };
    });
  }, [updateState]);

  const previousStep = useCallback(() => {
    updateState((current) => {
      const active = current.currentStep;
      const index = (ONBOARDING_STEPS as readonly string[]).indexOf(active);
      return { currentStep: ONBOARDING_STEPS[Math.max(index - 1, 0)] };
    });
  }, [updateState]);

  const setIntentSource = useCallback((value: StateUpdater<IntentSourceConfig>) => {
    setState((current) => {
      const src = typeof value === 'function' ? value(current.intentSource) : value;
      const updated = { ...src, provider: src.provider || 'local' };
      return {
        ...current,
        intentSource: updated,      };
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
    updateState({ isInstallingCli: true, cliInstallResult: undefined });
  }, [updateState]);

  const finishCliInstallation = useCallback((result: CliInstallResult) => {
    updateState({ isInstallingCli: false, cliInstallResult: result });
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

  const activeStep = state.currentStep;
  const currentIndex = (ONBOARDING_STEPS as readonly string[]).indexOf(activeStep);
  const canGoBack = currentIndex > 0 && state.currentStep !== 'summary';
  const canGoNext =
    currentIndex >= 0 &&
    currentIndex < ONBOARDING_STEPS.length - 1 &&
    state.currentStep !== 'welcome';

  return {
    state,
    currentStep: state.currentStep,
    canGoBack,
    canGoNext,
    goToStep,
    nextStep,
    previousStep,
    updateState,
    setIntentSource,    setEnvironment,
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
