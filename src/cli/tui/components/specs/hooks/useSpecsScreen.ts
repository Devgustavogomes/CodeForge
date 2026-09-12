import { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { ExecutionContext } from '../../../context/ExecutionContext.js';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { PlanningContext } from '../../../context/PlanningContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { ValidationResult } from '../../../../../application/use-cases/ValidatePlanUseCase.js';
import { PATHS } from '../../../../../infrastructure/paths.js';
import { SpecItemWithStats } from '../components/SpecList.js';
import { PlanGenerationResult } from '../components/SpecPlanProgress.js';
import { getSpecTaskCount } from '../../../context/ExecutionContext/taskLoader.js';

export type { SpecItemWithStats, PlanGenerationResult };

export interface UseSpecsScreenOptions {
  container?: AppContainer;
  initialSpecs?: SpecItemWithStats[];
  onOpenRun?: (specName: string) => void;
  onOpenTasks?: (specName: string) => void;
}

export function useSpecsScreen({
  container: propContainer,
  initialSpecs,
  onOpenRun,
  onOpenTasks,
}: UseSpecsScreenOptions = {}) {
  const contextContainer = useContext(ContainerContext);
  const container = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer]
  );

  const nav = useContext(NavigationContext);
  const exec = useContext(ExecutionContext);
  const planning = useContext(PlanningContext);
  const planningRef = useRef(planning);
  planningRef.current = planning;

  const [specs, setSpecs] = useState<SpecItemWithStats[]>(() => initialSpecs ?? []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeModal, setActiveModal] = useState<'create' | 'pull' | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'info' | 'success' | 'error';
    message: string;
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Local fallback states when PlanningContext is not available
  const [localIsGeneratingPlan, setLocalIsGeneratingPlan] = useState(false);
  const [localPlanStartTime, setLocalPlanStartTime] = useState<number | null>(null);
  const [localPlanEndTime, setLocalPlanEndTime] = useState<number | null>(null);
  const [localPlanResult, setLocalPlanResult] = useState<PlanGenerationResult | null>(null);
  const [localValidationErrors, setLocalValidationErrors] = useState<string[] | null>(null);

  const loadSpecs = useCallback(() => {
    const listUseCase = container.listSpecsUseCase;
    const rawSpecs = listUseCase.execute();
    const enriched: SpecItemWithStats[] = rawSpecs.map((s) => {
      const taskCount = getSpecTaskCount(container.gw, s.name);

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

    setSpecs(enriched);
  }, [container]);

  useEffect(() => {
    if (!initialSpecs) {
      loadSpecs();
    }
  }, [initialSpecs, loadSpecs]);

  useEffect(() => {
    if (initialSpecs) {
      setSpecs(initialSpecs);
    }
  }, [initialSpecs]);

  const selectedSpec = specs[selectedIndex] ?? null;

  const isCurrentSpecGenerating = Boolean(
    planning?.isGenerating && planning.generatingSpecName === selectedSpec?.name
  );
  const isCurrentSpecResult = Boolean(
    planning?.result && planning.generatingSpecName === selectedSpec?.name
  );

  const isGeneratingPlan = planning ? isCurrentSpecGenerating : localIsGeneratingPlan;
  const planStartTime = planning
    ? (isCurrentSpecGenerating || isCurrentSpecResult ? planning.startTime : null)
    : localPlanStartTime;
  const planEndTime = planning
    ? (isCurrentSpecResult ? planning.endTime : null)
    : localPlanEndTime;
  const planResult = planning
    ? (isCurrentSpecResult ? planning.result : null)
    : localPlanResult;
  const validationErrors =
    localValidationErrors ??
    (planning && planning.generatingSpecName === selectedSpec?.name
      ? planning.validationErrors
      : null);

  const navigateUp = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, specs.length - 1)));
    setActionFeedback(null);
    setLocalValidationErrors(null);
    setLocalPlanResult(null);
  }, [specs.length]);

  const navigateDown = useCallback(() => {
    setSelectedIndex((prev) => (prev < specs.length - 1 ? prev + 1 : 0));
    setActionFeedback(null);
    setLocalValidationErrors(null);
    setLocalPlanResult(null);
  }, [specs.length]);

  const handleOpenInRun = useCallback(
    (specName?: string) => {
      const target = specName ?? selectedSpec?.name;
      if (!target) return;
      exec?.setActiveSpec(target);
      if (onOpenRun) {
        onOpenRun(target);
      } else {
        nav?.setActiveTab('run');
      }
    },
    [nav, exec, onOpenRun, selectedSpec?.name]
  );

  const handleOpenInTasks = useCallback(
    (specName?: string) => {
      const target = specName ?? selectedSpec?.name;
      if (!target) return;
      exec?.setActiveSpec(target);
      if (onOpenTasks) {
        onOpenTasks(target);
      } else {
        nav?.setActiveTab('tasks');
      }
    },
    [nav, exec, onOpenTasks, selectedSpec?.name]
  );

  const handleValidatePlan = useCallback(() => {
    if (!selectedSpec) return;
    setIsValidating(true);
    setActionFeedback(null);
    setLocalValidationErrors(null);
    setLocalPlanResult(null);

    try {
      const useCase = container.validatePlanUseCase;
      const result: ValidationResult = useCase.execute(selectedSpec.name);

      if (result.kind === 'valid') {
        setActionFeedback({
          type: 'success',
          message: `Plan for "${selectedSpec.name}" is valid! (${selectedSpec.taskCount} tasks verified)`,
        });
        setLocalValidationErrors(null);
      } else if (result.kind === 'invalid') {
        setActionFeedback({
          type: 'error',
          message: `Plan for "${selectedSpec.name}" has ${result.errors.length} validation errors.`,
        });
        setLocalValidationErrors(result.errors);
      } else if (result.kind === 'spec-not-found') {
        setActionFeedback({
          type: 'error',
          message: `Tasks directory for "${selectedSpec.name}" not found. Generate plan first ('p').`,
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
  }, [selectedSpec, container]);

  const handleGeneratePlan = useCallback(async () => {
    if (!selectedSpec) return;

    if (planning?.isGenerating) {
      setActionFeedback({
        type: 'info',
        message: `Já existe um plano sendo gerado para "${planning.generatingSpecName}". Aguarde a conclusão.`,
      });
      return;
    }

    setActionFeedback(null);
    setLocalValidationErrors(null);
    setLocalPlanResult(null);

    if (planning) {
      try {
        await planning.generatePlan(selectedSpec.name);
        loadSpecs();

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
            message: `Plan generated and validated successfully for "${selectedSpec.name}"!`,
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
      const result = await useCase.execute(selectedSpec.name, model);
      const end = Date.now();
      setLocalPlanEndTime(end);

      loadSpecs();

      const taskCount = getSpecTaskCount(container.gw, selectedSpec.name);

      if (result.kind === 'valid') {
        setLocalPlanResult({
          kind: 'valid',
          taskCount: taskCount || selectedSpec.taskCount || 0,
        });
        setActionFeedback({
          type: 'success',
          message: `Plan generated and validated successfully for "${selectedSpec.name}"!`,
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
  }, [selectedSpec, planning, container, loadSpecs]);

  const openCreateModal = useCallback(() => setActiveModal('create'), []);
  const openPullModal = useCallback(() => setActiveModal('pull'), []);
  const closeModal = useCallback(() => setActiveModal(null), []);

  const handleModalSuccess = useCallback(
    (specName: string, action: 'created' | 'pulled') => {
      setActiveModal(null);
      loadSpecs();
      setActionFeedback({
        type: 'success',
        message: `Specification "${specName}" ${
          action === 'created' ? 'created' : 'pulled'
        } successfully!`,
      });
    },
    [loadSpecs]
  );

  return {
    container,
    specs,
    selectedIndex,
    selectedSpec,
    activeModal,
    actionFeedback,
    isValidating,
    isGeneratingPlan,
    planStartTime,
    planEndTime,
    planResult,
    validationErrors,
    generatingSpecName: planning?.generatingSpecName ?? null,
    loadSpecs,
    navigateUp,
    navigateDown,
    setSelectedIndex,
    openCreateModal,
    openPullModal,
    closeModal,
    handleOpenInRun,
    handleOpenInTasks,
    handleValidatePlan,
    handleGeneratePlan,
    handleModalSuccess,
    isTextInputActive: nav?.isTextInputActive ?? false,
  };
}

export default useSpecsScreen;
