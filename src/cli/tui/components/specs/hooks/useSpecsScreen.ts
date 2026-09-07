import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { ExecutionContext } from '../../../context/ExecutionContext.js';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { ValidationResult } from '../../../../../application/use-cases/ValidatePlanUseCase.js';
import { PATHS } from '../../../../../infrastructure/paths.js';
import { SpecItemWithStats } from '../components/SpecList.js';
import { PlanGenerationResult } from '../components/SpecPlanProgress.js';

export type { SpecItemWithStats, PlanGenerationResult };

export interface UseSpecsScreenOptions {
  container?: AppContainer;
  initialSpecs?: SpecItemWithStats[];
  onOpenRun?: (specName: string) => void;
}

export function useSpecsScreen({
  container: propContainer,
  initialSpecs,
  onOpenRun,
}: UseSpecsScreenOptions = {}) {
  const contextContainer = useContext(ContainerContext);
  const container = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer]
  );

  const nav = useContext(NavigationContext);
  const exec = useContext(ExecutionContext);

  const [specs, setSpecs] = useState<SpecItemWithStats[]>(() => initialSpecs ?? []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeModal, setActiveModal] = useState<'create' | 'pull' | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'info' | 'success' | 'error';
    message: string;
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planStartTime, setPlanStartTime] = useState<number | null>(null);
  const [planEndTime, setPlanEndTime] = useState<number | null>(null);
  const [planResult, setPlanResult] = useState<PlanGenerationResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);

  const loadSpecs = useCallback(() => {
    try {
      const listUseCase = container.listSpecsUseCase;
      const rawSpecs = listUseCase.execute();
      const enriched: SpecItemWithStats[] = rawSpecs.map((s) => {
        const tasksDir = `${PATHS.tasksDir}/${s.name}`;
        let taskCount = (s as SpecItemWithStats).taskCount ?? 0;
        if (container.gw?.exists && container.gw.exists(tasksDir)) {
          const files = container.gw.listDir(tasksDir);
          taskCount = files.filter((f) => f.endsWith('.json')).length;
        }

        let updatedAt: string | undefined;
        const execStatePath = PATHS.executionState(s.name);
        if (container.gw?.exists && container.gw.exists(execStatePath)) {
          try {
            const parsed = JSON.parse(container.gw.readFile(execStatePath));
            updatedAt = parsed.updatedAt || parsed.completedAt || parsed.startedAt;
          } catch {
            // ignore
          }
        }

        return {
          ...s,
          taskCount,
          updatedAt,
        };
      });

      setSpecs(enriched);
    } catch {
      // ignore
    }
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

  const navigateUp = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, specs.length - 1)));
    setActionFeedback(null);
    setValidationErrors(null);
    setPlanResult(null);
  }, [specs.length]);

  const navigateDown = useCallback(() => {
    setSelectedIndex((prev) => (prev < specs.length - 1 ? prev + 1 : 0));
    setActionFeedback(null);
    setValidationErrors(null);
    setPlanResult(null);
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

  const handleValidatePlan = useCallback(() => {
    if (!selectedSpec) return;
    setIsValidating(true);
    setActionFeedback(null);
    setValidationErrors(null);
    setPlanResult(null);

    try {
      const useCase = container.validatePlanUseCase;
      const result: ValidationResult = useCase.execute(selectedSpec.name);

      if (result.kind === 'valid') {
        setActionFeedback({
          type: 'success',
          message: `Plan for "${selectedSpec.name}" is valid! (${selectedSpec.taskCount} tasks verified)`,
        });
        setValidationErrors(null);
      } else if (result.kind === 'invalid') {
        setActionFeedback({
          type: 'error',
          message: `Plan for "${selectedSpec.name}" has ${result.errors.length} validation errors.`,
        });
        setValidationErrors(result.errors);
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
    const start = Date.now();
    setPlanStartTime(start);
    setPlanEndTime(null);
    setIsGeneratingPlan(true);
    setPlanResult(null);
    setValidationErrors(null);
    setActionFeedback(null);

    try {
      const config = container.configService?.loadConfig
        ? container.configService.loadConfig()
        : null;
      const model = config?.plannerAgent || 'default';
      const useCase = container.generatePlanUseCase;
      const result = await useCase.execute(selectedSpec.name, model);
      const end = Date.now();
      setPlanEndTime(end);

      loadSpecs();

      let taskCount = selectedSpec.taskCount;
      const tasksDir = `${PATHS.tasksDir}/${selectedSpec.name}`;
      if (container.gw?.exists && container.gw.exists(tasksDir)) {
        taskCount = container.gw.listDir(tasksDir).filter((f) => f.endsWith('.json')).length;
      }

      if (result.kind === 'valid') {
        setPlanResult({
          kind: 'valid',
          taskCount: taskCount || selectedSpec.taskCount || 0,
        });
        setActionFeedback({
          type: 'success',
          message: `Plan generated and validated successfully for "${selectedSpec.name}"!`,
        });
      } else if (result.kind === 'invalid') {
        setPlanResult({
          kind: 'invalid',
          errors: result.errors,
        });
        setValidationErrors(result.errors);
        setActionFeedback({
          type: 'error',
          message: `Generated plan has validation errors.`,
        });
      } else {
        setPlanResult({
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
      setPlanEndTime(end);
      const msg = err instanceof Error ? err.message : String(err);
      setPlanResult({
        kind: 'error',
        message: msg,
      });
      setActionFeedback({ type: 'error', message: `Plan generation failed: ${msg}` });
    } finally {
      setIsGeneratingPlan(false);
    }
  }, [selectedSpec, container, loadSpecs]);

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
    loadSpecs,
    navigateUp,
    navigateDown,
    setSelectedIndex,
    openCreateModal,
    openPullModal,
    closeModal,
    handleOpenInRun,
    handleValidatePlan,
    handleGeneratePlan,
    handleModalSuccess,
    isTextInputActive: nav?.isTextInputActive ?? false,
  };
}

export default useSpecsScreen;
