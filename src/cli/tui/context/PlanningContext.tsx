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
import { getSpecTaskCount } from './ExecutionContext/taskLoader.js';

export interface PlanGenerationResult {
  kind:
    | 'valid'
    | 'invalid'
    | 'failed'
    | 'not-initialized'
    | 'spec-not-found'
    | 'tasks-dir-not-found'
    | 'error'
    | string;
  taskCount?: number;
  errors?: string[];
  message?: string;
}

export interface PlanningContextValue {
  isGenerating: boolean;
  generatingSpecName: string | null;
  startTime: number | null;
  endTime: number | null;
  result: PlanGenerationResult | null;
  validationErrors: string[] | null;
  statusNotification: string | null;
  generatePlan: (specName: string) => Promise<void>;
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
  const appContainer = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer],
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingSpecName, setGeneratingSpecName] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [result, setResult] = useState<PlanGenerationResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const isGeneratingRef = useRef(false);
  const generatingSpecNameRef = useRef<string | null>(null);
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
      generatingSpecNameRef.current = null;
      setGeneratingSpecName(null);
    }
  }, []);

  const generatePlan = useCallback(
    async (specName: string): Promise<void> => {
      if (isGeneratingRef.current) {
        const activeSpec = generatingSpecNameRef.current ?? '';
        throw new Error(
          `Já existe um plano sendo gerado para "${activeSpec}". Aguarde a conclusão.`,
        );
      }

      isGeneratingRef.current = true;
      generatingSpecNameRef.current = specName;

      setIsGenerating(true);
      setGeneratingSpecName(specName);
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
        const config = appContainer.configService?.loadConfig
          ? appContainer.configService.loadConfig()
          : null;
        const model = config?.plannerAgent || 'default';

        const useCaseResult = await appContainer.generatePlanUseCase.execute(specName, model);

        if (!isMountedRef.current) return;

        const end = Date.now();
        setEndTime(end);

        if (useCaseResult.kind === 'valid') {
          const gw = appContainer.gw ?? appContainer.workspaceGateway;
          const taskCount = gw ? getSpecTaskCount(gw, specName) : 0;
          setResult({
            kind: 'valid',
            taskCount,
          });
          setValidationErrors(null);

          const notificationMsg = `✓ Plano gerado para ${specName}`;
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
    [appContainer],
  );

  const value = useMemo<PlanningContextValue>(
    () => ({
      isGenerating,
      generatingSpecName,
      startTime,
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
      generatingSpecName,
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
