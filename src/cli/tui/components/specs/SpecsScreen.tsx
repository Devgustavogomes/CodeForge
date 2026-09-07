import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigation } from '../../context/NavigationContext.js';
import { useExecution } from '../../context/ExecutionContext.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { AppContainer, createAppContainer } from '../../../../infrastructure/container.js';
import { ListSpecsUseCase, SpecInfo } from '../../../../application/use-cases/ListSpecsUseCase.js';
import { ValidatePlanUseCase, ValidationResult } from '../../../../application/use-cases/ValidatePlanUseCase.js';
import { GeneratePlanUseCase } from '../../../../application/use-cases/GeneratePlanUseCase.js';
import { PATHS } from '../../../../infrastructure/paths.js';
import { CreateSpecModal } from './CreateSpecModal.js';
import { PullSpecModal } from './PullSpecModal.js';

export interface SpecItemWithStats extends SpecInfo {
  taskCount: number;
  updatedAt?: string;
}

export interface SpecsScreenProps {
  container?: AppContainer;
  initialSpecs?: SpecItemWithStats[];
  onOpenRun?: (specName: string) => void;
  isInteractive?: boolean;
}

const STATUS_BADGE_MAP: Record<string, { label: string; color: string }> = {
  not_started: { label: '[NOT STARTED]', color: 'gray' },
  planned: { label: '[PLANNED]', color: 'blue' },
  in_progress: { label: '[IN PROGRESS]', color: 'yellow' },
  completed: { label: '[COMPLETED]', color: 'green' },
};

export const SpecsScreen: React.FC<SpecsScreenProps> = ({
  container: propContainer,
  initialSpecs,
  onOpenRun,
  isInteractive = true,
}) => {
  let nav: ReturnType<typeof useNavigation> | undefined;
  try {
    nav = useNavigation();
  } catch {
    // Graceful fallback outside NavigationProvider
  }

  let exec: ReturnType<typeof useExecution> | undefined;
  try {
    exec = useExecution();
  } catch {
    // Graceful fallback outside ExecutionProvider
  }

  const { breakpoint } = useTerminalDimensions();
  const container = useMemo(() => propContainer ?? createAppContainer(), [propContainer]);

  const [specs, setSpecs] = useState<SpecItemWithStats[]>(() => initialSpecs ?? []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeModal, setActiveModal] = useState<'create' | 'pull' | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);

  const loadSpecs = useCallback(() => {
    try {
      const listUseCase = container.listSpecsUseCase;
      const rawSpecs = listUseCase.execute();
      const enriched: SpecItemWithStats[] = rawSpecs.map((s) => {
        const tasksDir = `${PATHS.tasksDir}/${s.name}`;
        let taskCount = 0;
        if (container.gw.exists(tasksDir)) {
          const files = container.gw.listDir(tasksDir);
          taskCount = files.filter((f) => f.endsWith('.json')).length;
        }

        let updatedAt: string | undefined;
        const execStatePath = PATHS.executionState(s.name);
        if (container.gw.exists(execStatePath)) {
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

  const selectedSpec = specs[selectedIndex] ?? null;

  const handleOpenInRun = useCallback(
    (specName: string) => {
      nav?.setActiveSpec(specName);
      exec?.setActiveSpec(specName);
      if (onOpenRun) {
        onOpenRun(specName);
      } else {
        nav?.setActiveTab('run');
      }
    },
    [nav, exec, onOpenRun]
  );

  const handleValidatePlan = useCallback(() => {
    if (!selectedSpec) return;
    setIsValidating(true);
    setActionFeedback(null);
    setValidationErrors(null);

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
          message: `Tasks directory for "${selectedSpec.name}" not found. Generate plan first ('g').`,
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
    setIsGenerating(true);
    setActionFeedback({
      type: 'info',
      message: `Generating execution plan for "${selectedSpec.name}"...`,
    });
    setValidationErrors(null);

    try {
      const config = container.configService.loadConfig();
      const model = config?.plannerAgent || 'default';
      const useCase = container.generatePlanUseCase;
      const result = await useCase.execute(selectedSpec.name, model);

      loadSpecs();

      if (result.kind === 'valid') {
        setActionFeedback({
          type: 'success',
          message: `Plan generated and validated successfully for "${selectedSpec.name}"!`,
        });
      } else if (result.kind === 'invalid') {
        setActionFeedback({
          type: 'error',
          message: `Generated plan has validation errors.`,
        });
        setValidationErrors(result.errors);
      } else {
        setActionFeedback({
          type: 'error',
          message: `Plan generation failed: ${result.kind}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionFeedback({ type: 'error', message: `Plan generation failed: ${msg}` });
    } finally {
      setIsGenerating(false);
    }
  }, [selectedSpec, container, loadSpecs]);

  useInput(
    (input, key) => {
      if (!isInteractive || activeModal !== null || nav?.isTextInputActive) {
        return;
      }

      // Navigate list: Up/Down or k/j
      if (key.upArrow || input === 'k') {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, specs.length - 1)));
        setActionFeedback(null);
        setValidationErrors(null);
        return;
      }
      if (key.downArrow || input === 'j') {
        setSelectedIndex((prev) => (prev < specs.length - 1 ? prev + 1 : 0));
        setActionFeedback(null);
        setValidationErrors(null);
        return;
      }

      // 'c' -> Open CreateSpecModal
      if (input === 'c' || input === 'C') {
        setActiveModal('create');
        return;
      }

      // 'p' -> Open PullSpecModal
      if (input === 'p' || input === 'P') {
        setActiveModal('pull');
        return;
      }

      // 'g' -> Generate plan
      if (input === 'g' || input === 'G') {
        void handleGeneratePlan();
        return;
      }

      // 'v' -> Validate plan
      if (input === 'v' || input === 'V') {
        handleValidatePlan();
        return;
      }

      // Enter -> Open in Run dashboard
      if (key.return || input === '\r' || input === '\n') {
        if (selectedSpec) {
          handleOpenInRun(selectedSpec.name);
        }
        return;
      }
    },
    { isActive: isInteractive && activeModal === null }
  );

  const isSideBySide = breakpoint !== 'minimal';
  const maxVisibleSpecs = 6;
  const visibleSpecs = useMemo(() => {
    if (specs.length <= maxVisibleSpecs) return specs;
    const selectedIdx = Math.max(0, selectedIndex);
    let start = Math.max(0, selectedIdx - Math.floor(maxVisibleSpecs / 2));
    if (start + maxVisibleSpecs > specs.length) {
      start = Math.max(0, specs.length - maxVisibleSpecs);
    }
    return specs.slice(start, start + maxVisibleSpecs);
  }, [specs, maxVisibleSpecs, selectedIndex]);

  if (activeModal === 'create') {
    return (
      <CreateSpecModal
        isOpen={true}
        onClose={() => setActiveModal(null)}
        container={container}
        width="100%"
        onSuccess={(specName) => {
          setActiveModal(null);
          loadSpecs();
          setActionFeedback({
            type: 'success',
            message: `Specification "${specName}" created successfully!`,
          });
        }}
      />
    );
  }

  if (activeModal === 'pull') {
    return (
      <PullSpecModal
        isOpen={true}
        onClose={() => setActiveModal(null)}
        container={container}
        width="100%"
        onSuccess={(specName) => {
          setActiveModal(null);
          loadSpecs();
          setActionFeedback({
            type: 'success',
            message: `Specification "${specName}" pulled successfully!`,
          });
        }}
      />
    );
  }

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      {/* Main Container */}
      <Box flexDirection={isSideBySide ? 'row' : 'column'} width="100%" flexGrow={1}>
        {/* Left Column: Spec List */}
        <Box
          flexDirection="column"
          width={isSideBySide ? '45%' : '100%'}
          borderStyle="round"
          borderColor="blue"
          paddingX={1}
        >
          <Box justifyContent="space-between" marginBottom={0}>
            <Text bold color="blue">
              Specifications ({specs.length})
            </Text>
            <Text dimColor>[c] Create · [p] Pull</Text>
          </Box>

          {specs.length === 0 ? (
            <Box paddingY={1} justifyContent="center" flexDirection="column" alignItems="center">
              <Text dimColor>No specifications found in .codeforge/specs/</Text>
              <Text dimColor>Press 'c' to create a new spec or 'p' to pull from GitHub/Linear.</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              {visibleSpecs.map((spec) => {
                const isSelected = selectedSpec?.name === spec.name;
                const badge = STATUS_BADGE_MAP[spec.status] ?? {
                  label: `[${spec.status.toUpperCase()}]`,
                  color: 'gray',
                };

                return (
                  <Box key={spec.name} justifyContent="space-between" width="100%">
                    <Box gap={1} flexShrink={1}>
                      <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                        {isSelected ? '❯' : ' '}
                      </Text>
                      <Box width={14}>
                        <Text bold={isSelected} color={isSelected ? 'cyan' : 'white'} wrap="truncate-end">
                          {spec.name}
                        </Text>
                      </Box>
                      <Text color={badge.color} bold>
                        {badge.label}
                      </Text>
                    </Box>
                    <Box flexShrink={0} paddingLeft={1}>
                      <Text dimColor>{spec.taskCount} tasks</Text>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        {/* Right Column: Spec Details, Actions & Validation Feedback */}
        <Box
          flexDirection="column"
          width={isSideBySide ? '55%' : '100%'}
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
        >
          <Box marginBottom={0}>
            <Text bold color="cyan">
              Spec Details & Actions
            </Text>
          </Box>

          {selectedSpec ? (
            <Box flexDirection="column" width="100%">
              <Box justifyContent="space-between">
                <Box gap={1}>
                  <Text bold>Name: </Text>
                  <Text bold color="cyan">{selectedSpec.name}</Text>
                </Box>
                <Text color={STATUS_BADGE_MAP[selectedSpec.status]?.color || 'white'} bold>
                  {selectedSpec.status}
                </Text>
              </Box>
              <Box>
                <Text bold>Title: </Text>
                <Text wrap="truncate-end">{selectedSpec.title}</Text>
              </Box>
              <Box justifyContent="space-between">
                <Box gap={1}>
                  <Text bold>Tasks: </Text>
                  <Text>{selectedSpec.taskCount} tasks defined</Text>
                </Box>
                {selectedSpec.updatedAt && (
                  <Box gap={1}>
                    <Text bold>Updated: </Text>
                    <Text dimColor>{new Date(selectedSpec.updatedAt).toLocaleTimeString()}</Text>
                  </Box>
                )}
              </Box>

              {/* Action feedback */}
              {actionFeedback && (
                <Box
                  marginY={0}
                  paddingX={1}
                  borderStyle="single"
                  borderColor={
                    actionFeedback.type === 'success'
                      ? 'green'
                      : actionFeedback.type === 'error'
                      ? 'red'
                      : 'yellow'
                  }
                >
                  <Text
                    color={
                      actionFeedback.type === 'success'
                        ? 'green'
                        : actionFeedback.type === 'error'
                        ? 'red'
                        : 'yellow'
                    }
                    bold
                    wrap="truncate-end"
                  >
                    {actionFeedback.message}
                  </Text>
                </Box>
              )}

              {/* Validation errors */}
              {validationErrors && validationErrors.length > 0 && (
                <Box flexDirection="column" marginY={0}>
                  <Text color="red" bold>
                    Errors ({validationErrors.length}):
                  </Text>
                  {validationErrors.slice(0, 2).map((err, i) => (
                    <Text key={i} color="red" dimColor wrap="truncate-end">
                      • {err}
                    </Text>
                  ))}
                  {validationErrors.length > 2 && (
                    <Text dimColor>...and {validationErrors.length - 2} more</Text>
                  )}
                </Box>
              )}

              {/* Status indicators */}
              {isValidating && (
                <Box marginY={0}>
                  <Text color="yellow">🔍 Validating plan dependency DAG...</Text>
                </Box>
              )}
              {isGenerating && (
                <Box marginY={0}>
                  <Text color="yellow">⚙ Generating tasks from specification...</Text>
                </Box>
              )}

              {/* Action shortcuts hint */}
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>[Enter] Open in Run  │  [g] Generate Plan</Text>
                <Text dimColor>[v] Validate Plan    │  [c] Create  │  [p] Pull</Text>
              </Box>
            </Box>
          ) : (
            <Box paddingY={1} justifyContent="center">
              <Text dimColor>Select a specification to view details and execute actions.</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
