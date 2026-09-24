import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import { AppContainer, createAppContainer } from '../../../infrastructure/container.js';
import { ContainerContext } from './ContainerContext.js';
import { getIntentTaskCount, } from './ExecutionContext/taskLoader.js';
import { useConfig } from './ConfigContext.js';

export interface PlanGenerationResult {
  kind:
    | 'valid'
    | 'invalid'
    | 'failed'
    | 'not-initialized'
    | 'intent-not-found'
    | 'intent-not-found'
    | 'tasks-dir-not-found'
    | 'error'
    | string;
  taskCount?: number;
  errors?: string[];
  message?: string;
}

export interface PlanningContextValue {
  isGenerating: boolean;
  generatingIntentName: string | null;  startTime: number | null;
  endTime: number | null;
  result: PlanGenerationResult | null;
  validationErrors: string[] | null;
  statusNotification: string | null;
  generatePlan: (intentName: string) => Promise<void>;
  clearPlanResult: () => void;
  clearStatusNotification: () => void;
}

export interface PlanningProviderProps {
  children: ReactNode;
  container?: AppContainer;
}

export const PlanningContext = createContext<PlanningContextValue | null>(null);

export const PlanningProvider: React.FC<PlanningProviderProps> = ({
  children,
  container: propContainer,
}) => {
  const contextContainer = useContext(ContainerContext) ?? undefined;
  const { config } = useConfig();
  const appContainer = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer],
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingIntentName, setGeneratingIntentName] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [result, setResult] = useState<PlanGenerationResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const isGeneratingRef = useRef(false);
  const generatingIntentNameRef = useRef<string | null>(null);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
        notificationTimeoutRef.current = null;
      }
    };
  }, []);

  const clearStatusNotification = useCallback(() => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = null;
    }
    if (isMountedRef.current) {
      setStatusNotification(null);
    }
  }, []);

  const clearPlanResult = useCallback(() => {
    setResult(null);
    setValidationErrors(null);
    setStartTime(null);
    setEndTime(null);
    if (!isGeneratingRef.current) {
      generatingIntentNameRef.current = null;
      setGeneratingIntentName(null);
    }
  }, []);

  const generatePlan = useCallback(
    async (intentName: string): Promise<void> => {
      if (isGeneratingRef.current) {
        const activeIntent = generatingIntentNameRef.current ?? '';
        throw new Error(
          `Já existe um plano sendo gerado para "${activeIntent}". Aguarde a conclusão.`,
        );
      }

      isGeneratingRef.current = true;
      generatingIntentNameRef.current = intentName;

      setIsGenerating(true);
      setGeneratingIntentName(intentName);
      const start = Date.now();
      setStartTime(start);
      setEndTime(null);
      setResult(null);
      setValidationErrors(null);

      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
        notificationTimeoutRef.current = null;
      }
      setStatusNotification(null);

      try {
        const planConfig = { ...config };
        const model = planConfig.plannerAgent || 'default';
        const useCase = appContainer.createGeneratePlanUseCase(planConfig);
        const useCaseResult = await useCase.execute(intentName, model);

        if (!isMountedRef.current) return;

        const end = Date.now();
        setEndTime(end);

        if (useCaseResult.kind === 'valid') {
          const gw = appContainer.gw ?? appContainer.workspaceGateway;
          const taskCount = gw ? getIntentTaskCount(gw, intentName) : 0;
          setResult({
            kind: 'valid',
            taskCount,
          });
          setValidationErrors(null);

          const notificationMsg = `✓ Plano gerado para ${intentName}`;
          setStatusNotification(notificationMsg);

          if (notificationTimeoutRef.current) {
            clearTimeout(notificationTimeoutRef.current);
          }
          notificationTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setStatusNotification(null);
            }
            notificationTimeoutRef.current = null;
          }, 5000);
        } else if (useCaseResult.kind === 'invalid') {
          setResult({
            kind: 'invalid',
            errors: useCaseResult.errors,
          });
          setValidationErrors(useCaseResult.errors);
        } else {
          setResult({
            kind: useCaseResult.kind,
            message: `Plan generation failed: ${useCaseResult.kind}`,
          });
          setValidationErrors(null);
        }
      } catch (err: unknown) {
        if (!isMountedRef.current) return;

        const end = Date.now();
        setEndTime(end);
        const msg = err instanceof Error ? err.message : String(err);
        setResult({
          kind: 'error',
          message: msg,
        });
        setValidationErrors(null);
      } finally {
        isGeneratingRef.current = false;
        if (isMountedRef.current) {
          setIsGenerating(false);
        }
      }
    },
    [appContainer, config],
  );

  const value = useMemo<PlanningContextValue>(
    () => ({
      isGenerating,
      generatingIntentName,      startTime,
      endTime,
      result,
      validationErrors,
      statusNotification,
      generatePlan,
      clearPlanResult,
      clearStatusNotification,
    }),
    [
      isGenerating,
      generatingIntentName,
      startTime,
      endTime,
      result,
      validationErrors,
      statusNotification,
      generatePlan,
      clearPlanResult,
      clearStatusNotification,
    ],
  );

  return <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>;
};

export function usePlanning(): PlanningContextValue {
  const context = useContext(PlanningContext);
  if (!context) {
    throw new Error('usePlanning must be used within a PlanningProvider');
  }
  return context;
}
