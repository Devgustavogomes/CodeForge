import { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { ExecutionContext } from '../../../context/ExecutionContext.js';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { PlanningContext } from '../../../context/PlanningContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { ValidationResult } from '../../../../../application/use-cases/ValidatePlanUseCase.js';
import { PATHS } from '../../../../../infrastructure/paths.js';
import { IntentItemWithStats } from '../components/IntentList.js';
import { PlanGenerationResult } from '../components/IntentPlanProgress.js';
import { getIntentTaskCount } from '../../../context/ExecutionContext/taskLoader.js';
import { SupportedLanguage } from '../../../../../config/types.js';
import { translate } from '../../../../ui/i18n.js';

export type { IntentItemWithStats, PlanGenerationResult };
export interface IntentsActionFeedback {
  type: 'info' | 'success' | 'error';
  message: string;
}

export type IntentsModal = 'create' | 'pull' | 'delete' | null;
export interface UseIntentsScreenOptions {
  container?: AppContainer;
  initialIntents?: IntentItemWithStats[];  onOpenRun?: (intentName: string) => void;
  onOpenTasks?: (intentName: string) => void;
  onFeedback?: (feedback: IntentsActionFeedback) => void;
  onNotification?: (
    message: string,
    type?: 'success' | 'error' | 'info',
  ) => void;
  language?: SupportedLanguage;
}

export function useIntentsScreen({
  container: propContainer,
  initialIntents,
    onOpenRun,
  onOpenTasks,
  onFeedback,
  onNotification,
  language: propLanguage,
}: UseIntentsScreenOptions = {}) {
  const contextContainer = useContext(ContainerContext);
  const container = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer]
  );

  const language: SupportedLanguage = useMemo(() => {
    if (propLanguage) return propLanguage;
    try {
      return container.configService?.loadConfig?.()?.language ?? 'en';
    } catch {
      return 'en';
    }
  }, [container, propLanguage]);

  const nav = useContext(NavigationContext);
  const exec = useContext(ExecutionContext);
  const planning = useContext(PlanningContext);
  const planningRef = useRef(planning);
  planningRef.current = planning;

  const [intents, setIntents] = useState<IntentItemWithStats[]>(
    () => initialIntents ?? []
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeModal, setActiveModal] = useState<IntentsModal>(null);
  const [actionFeedback, setActionFeedback] = useState<IntentsActionFeedback | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const isDeleteConfirmingRef = useRef(false);

  // Local fallback states when PlanningContext is not available
  const [localIsGeneratingPlan, setLocalIsGeneratingPlan] = useState(false);
  const [localPlanStartTime, setLocalPlanStartTime] = useState<number | null>(null);
  const [localPlanEndTime, setLocalPlanEndTime] = useState<number | null>(null);
  const [localPlanResult, setLocalPlanResult] = useState<PlanGenerationResult | null>(null);
  const [localValidationErrors, setLocalValidationErrors] = useState<string[] | null>(null);

  const loadIntents = useCallback((): IntentItemWithStats[] => {
    const listUseCase = container.listIntentsUseCase ?? container.listIntentsUseCase;
    const rawIntents = listUseCase.execute();
    const enriched: IntentItemWithStats[] = rawIntents.map((s) => {
      const taskCount = getIntentTaskCount(container.gw, s.name);

      let updatedAt: string | undefined;
      const execStatePath = PATHS.executionState(s.name);
      if (container.gw.exists(execStatePath)) {
        try {
          const parsed = JSON.parse(container.gw.readFile(execStatePath));
          updatedAt = parsed.updatedAt || parsed.completedAt || parsed.startedAt;
        } catch {
          // ignore corrupt state file
        }
      }

      return {
        ...s,
        taskCount,
        updatedAt,
      };
    });

    setIntents(enriched);
    setSelectedIndex((currentIndex) =>
      Math.min(currentIndex, Math.max(0, enriched.length - 1))
    );
    return enriched;
  }, [container]);

  useEffect(() => {
    if (!initialIntents) {
      loadIntents();
    }
  }, [initialIntents, loadIntents]);

  useEffect(() => {
    if (initialIntents) {
      setIntents(initialIntents);
    }
  }, [initialIntents]);

  const selectedIntent = intents[selectedIndex] ?? null;

  const currentGeneratingName = planning?.generatingIntentName;
  const isCurrentIntentGenerating = Boolean(
    planning?.isGenerating && currentGeneratingName === selectedIntent?.name
  );
  const isCurrentIntentResult = Boolean(
    planning?.result && currentGeneratingName === selectedIntent?.name
  );

  const isGeneratingPlan = planning ? isCurrentIntentGenerating : localIsGeneratingPlan;
  const planStartTime = planning
    ? (isCurrentIntentGenerating || isCurrentIntentResult ? planning.startTime : null)
    : localPlanStartTime;
  const planEndTime = planning
    ? (isCurrentIntentResult ? planning.endTime : null)
    : localPlanEndTime;
  const planResult = planning
    ? (isCurrentIntentResult ? planning.result : null)
    : localPlanResult;
  const validationErrors =
    localValidationErrors ??
    (planning && currentGeneratingName === selectedIntent?.name
      ? planning.validationErrors
      : null);

  const navigateUp = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, intents.length - 1)));
    setActionFeedback(null);
    setLocalValidationErrors(null);
    setLocalPlanResult(null);
  }, [intents.length]);

  const navigateDown = useCallback(() => {
    setSelectedIndex((prev) => (prev < intents.length - 1 ? prev + 1 : 0));
    setActionFeedback(null);
    setLocalValidationErrors(null);
    setLocalPlanResult(null);
  }, [intents.length]);

  const handleOpenInRun = useCallback(
    (intentName?: string) => {
      const target = intentName ?? selectedIntent?.name;
      if (!target) return;
      exec?.setActiveIntent?.(target);
      exec?.setActiveIntent?.(target);
      if (onOpenRun) {
        onOpenRun(target);
      } else {
        nav?.setActiveTab('run');
      }
    },
    [nav, exec, onOpenRun, selectedIntent?.name]
  );

  const handleOpenInTasks = useCallback(
    (intentName?: string) => {
      const target = intentName ?? selectedIntent?.name;
      if (!target) return;
      exec?.setActiveIntent?.(target);
      exec?.setActiveIntent?.(target);
      if (onOpenTasks) {
        onOpenTasks(target);
      } else {
        nav?.setActiveTab('tasks');
      }
    },
    [nav, exec, onOpenTasks, selectedIntent?.name]
  );

  const handleValidatePlan = useCallback(() => {
    if (!selectedIntent) return;
    setIsValidating(true);
    setActionFeedback(null);
    setLocalValidationErrors(null);
    setLocalPlanResult(null);

    try {
      const useCase = container.validatePlanUseCase;
      const result: ValidationResult = useCase.execute(selectedIntent.name);

      if (result.kind === 'valid') {
        setActionFeedback({
          type: 'success',
          message: `Plan for "${selectedIntent.name}" is valid! (${selectedIntent.taskCount} tasks verified)`,
        });
        setLocalValidationErrors(null);
      } else if (result.kind === 'invalid') {
        setActionFeedback({
          type: 'error',
          message: `Plan for "${selectedIntent.name}" has ${result.errors.length} validation errors.`,
        });
        setLocalValidationErrors(result.errors);
      } else if (result.kind === 'intent-not-found') {
        setActionFeedback({
          type: 'error',
          message: `Tasks directory for "${selectedIntent.name}" not found. Generate plan first ('g').`,
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: 'Workspace not initialized.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionFeedback({ type: 'error', message: `Validation failed: ${msg}` });
    } finally {
      setIsValidating(false);
    }
  }, [selectedIntent, container]);

  const handleGeneratePlan = useCallback(async () => {
    if (!selectedIntent) return;

    if (planning?.isGenerating) {
      const activeName = planning.generatingIntentName || planning.generatingIntentName;
      setActionFeedback({
        type: 'info',
        message: `Já existe um plano sendo gerado para "${activeName}". Aguarde a conclusão.`,
      });
      return;
    }

    setActionFeedback(null);
    setLocalValidationErrors(null);
    setLocalPlanResult(null);

    if (planning) {
      try {
        await planning.generatePlan(selectedIntent.name);
        loadIntents();

        const latestResult = planningRef.current?.result;
        if (latestResult && latestResult.kind !== 'valid') {
          setActionFeedback({
            type: 'error',
            message:
              latestResult.message ||
              (latestResult.kind === 'invalid'
                ? 'Generated plan has validation errors.'
                : `Plan generation failed: ${latestResult.kind}`),
          });
        } else {
          setActionFeedback({
            type: 'success',
            message: `Plan generated and validated successfully for "${selectedIntent.name}"!`,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setActionFeedback({
          type: 'error',
          message: `Plan generation failed: ${msg}`,
        });
      }
      return;
    }

    // Fallback if PlanningContext is not mounted
    const start = Date.now();
    setLocalPlanStartTime(start);
    setLocalPlanEndTime(null);
    setLocalIsGeneratingPlan(true);

    try {
      const config = container.configService?.loadConfig
        ? container.configService.loadConfig()
        : null;
      const model = config?.plannerAgent || 'default';
      const useCase = container.generatePlanUseCase;
      const result = await useCase.execute(selectedIntent.name, model);
      const end = Date.now();
      setLocalPlanEndTime(end);

      loadIntents();

      const taskCount = getIntentTaskCount(container.gw, selectedIntent.name);

      if (result.kind === 'valid') {
        setLocalPlanResult({
          kind: 'valid',
          taskCount: taskCount || selectedIntent.taskCount || 0,
        });
        setActionFeedback({
          type: 'success',
          message: `Plan generated and validated successfully for "${selectedIntent.name}"!`,
        });
      } else if (result.kind === 'invalid') {
        setLocalPlanResult({
          kind: 'invalid',
          errors: result.errors,
        });
        setLocalValidationErrors(result.errors);
        setActionFeedback({
          type: 'error',
          message: `Generated plan has validation errors.`,
        });
      } else {
        setLocalPlanResult({
          kind: result.kind,
          message: `Plan generation failed: ${result.kind}`,
        });
        setActionFeedback({
          type: 'error',
          message: `Plan generation failed: ${result.kind}`,
        });
      }
    } catch (err: unknown) {
      const end = Date.now();
      setLocalPlanEndTime(end);
      const msg = err instanceof Error ? err.message : String(err);
      setLocalPlanResult({
        kind: 'error',
        message: msg,
      });
      setActionFeedback({ type: 'error', message: `Plan generation failed: ${msg}` });
    } finally {
      setLocalIsGeneratingPlan(false);
    }
  }, [selectedIntent, planning, container, loadIntents]);

  const openCreateModal = useCallback(() => setActiveModal('create'), []);
  const openPullModal = useCallback(() => setActiveModal('pull'), []);
  const closeModal = useCallback(() => setActiveModal(null), []);

  const publishDeleteFeedback = useCallback(
    (feedback: IntentsActionFeedback) => {
      setActionFeedback(feedback);
      onFeedback?.(feedback);
      onNotification?.(feedback.message, feedback.type);
    },
    [onFeedback, onNotification]
  );

  const openDeleteModal = useCallback(() => {
    if (!selectedIntent) return;
    isDeleteConfirmingRef.current = false;
    setActionFeedback(null);
    setActiveModal('delete');
  }, [selectedIntent]);

  const cancelDelete = useCallback(() => {
    isDeleteConfirmingRef.current = false;
    setActiveModal(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!selectedIntent || activeModal !== 'delete' || isDeleteConfirmingRef.current) {
      return;
    }

    isDeleteConfirmingRef.current = true;
    const intentName = selectedIntent.name;
    setActiveModal(null);

    const deleteUseCase = container.deleteIntentUseCase ?? container.deleteIntentUseCase;
    let result: ReturnType<typeof deleteUseCase.execute>;
    try {
      result = deleteUseCase.execute(intentName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const translatedMsg = translate('tui_intent_delete_error', language, {
        intent: intentName,
        error: message,
      });
      publishDeleteFeedback({
        type: 'error',
        message: translatedMsg !== 'tui_intent_delete_error' ? translatedMsg : `Failed to delete intent '${intentName}': ${message}`,
      });
      return;
    }

    switch (result.kind) {
      case 'deleted': {
        loadIntents();
        const deletedName = result.intentName || intentName;
        const translatedSuccess = translate('tui_intent_delete_success', language, {
          intent: deletedName,
        });
        publishDeleteFeedback({
          type: 'success',
          message: translatedSuccess !== 'tui_intent_delete_success' ? translatedSuccess : `Intent '${deletedName}' deleted successfully.`,
        });
        return;
      }
      case 'intent-not-found': {
        const translatedNotFound = translate('tui_intent_delete_not_found', language, { intent: intentName });
        publishDeleteFeedback({
          type: 'error',
          message: translatedNotFound !== 'tui_intent_delete_not_found' ? translatedNotFound : `Intent '${intentName}' was not found.`,
        });
        return;
      }
      case 'not-initialized': {
        const translatedNotInit = translate('tui_delete_not_initialized', language);
        publishDeleteFeedback({
          type: 'error',
          message: translatedNotInit !== 'tui_delete_not_initialized' ? translatedNotInit : 'Workspace is not initialized.',
        });
        return;
      }
    }
  }, [activeModal, container, language, loadIntents, publishDeleteFeedback, selectedIntent]);

  const handleModalSuccess = useCallback(
    (intentName: string, action: 'created' | 'pulled') => {
      setActiveModal(null);
      loadIntents();
      setActionFeedback({
        type: 'success',
        message: `Intent "${intentName}" ${
          action === 'created' ? 'created' : 'pulled'
        } successfully!`,
      });
    },
    [loadIntents]
  );

  return {
    container,
    intents,    selectedIndex,
    selectedIntent,    activeModal,
    actionFeedback,
    language,
    isValidating,
    isGeneratingPlan,
    planStartTime,
    planEndTime,
    planResult,
    validationErrors,
    generatingIntentName: planning?.generatingIntentName ?? planning?.generatingIntentName ?? null,    loadIntents,    navigateUp,
    navigateDown,
    setSelectedIndex,
    openCreateModal,
    openPullModal,
    closeModal,
    openDeleteModal,
    cancelDelete,
    confirmDelete,
    handleOpenInRun,
    handleOpenInTasks,
    handleValidatePlan,
    handleGeneratePlan,
    handleModalSuccess,
    isTextInputActive: nav?.isTextInputActive ?? false,
  };
}

export default useIntentsScreen;
