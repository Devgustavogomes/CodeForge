import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { AppContainer } from '../../../../../infrastructure/container.js';
import { NodeWorkspaceGateway } from '../../../../../infrastructure/workspace.js';
import { ConfigService } from '../../../../../config/ConfigService.js';
import { CodeForgeConfig, resolveAiReviewConfig } from '../../../../../config/types.js';
import { FIELD_ORDER, LANGUAGES } from '../components/ConfigField.js';
import { HookMap } from '../../../../../domain/hook.js';
import { IntentSourceConfig } from '../../../../../domain/intent-source.js';
import { IntentSourceFactory } from '../../../../../infrastructure/intent-sources/IntentSourceFactory.js';

export interface UseConfigScreenOptions {
  container?: AppContainer;
  configService?: ConfigService;
  initialConfig?: CodeForgeConfig;
  sharedConfig?: CodeForgeConfig;
  onSave?: (config: CodeForgeConfig) => void;
}

export const DEFAULT_CONFIG: CodeForgeConfig = {
  language: 'en',
  environment: 'local',
  plannerAgent: 'default',
  executorAgent: 'default',
  hooks: {},
  intentSource: { provider: 'filesystem' },
  aiReview: resolveAiReviewConfig(),
};

function withAiReviewDefaults(config: CodeForgeConfig): CodeForgeConfig {
  return { ...config, aiReview: resolveAiReviewConfig(config.aiReview) };
}

export function useConfigScreen(options: UseConfigScreenOptions = {}) {
  const {
    container = (globalThis as unknown as { __codeforge_container?: AppContainer }).__codeforge_container!,
    configService: customConfigService,
    initialConfig,
    sharedConfig,
    onSave,
  } = options;

  const configService = useMemo(() => {
    return (
      customConfigService ??
      container?.configService ??
      new ConfigService(container?.gw ?? new NodeWorkspaceGateway(process.cwd()))
    );
  }, [customConfigService, container]);

  const [config, setConfig] = useState<CodeForgeConfig>(() => {
    if (initialConfig) return withAiReviewDefaults(initialConfig);
    try {
      const loaded = configService.loadConfig();
      return loaded ? withAiReviewDefaults(loaded) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });
  const [savedConfig, setSavedConfig] = useState<CodeForgeConfig>(() => {
    if (initialConfig) return withAiReviewDefaults(initialConfig);
    try {
      const loaded = configService.loadConfig();
      return loaded ? withAiReviewDefaults(loaded) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const [focusedFieldIndex, setFocusedFieldIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  // State updates are applied after the current event. A hydration effect may
  // already be queued with the previous clean value, so track edits eagerly.
  const dirtyRef = useRef(false);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setIsDirty(true);
  }, []);
  const [isHooksModalOpen, setIsHooksModalOpen] = useState(false);
  const [isIntentSourceModalOpen, setIsIntentSourceModalOpen] = useState(false);
  const [isAiReviewModalOpen, setIsAiReviewModalOpen] = useState(false);

  // App reloads shared config when this tab is entered. Adopt that snapshot only
  // while the form is clean, so unrelated renders never discard user edits.
  useEffect(() => {
    if (!dirtyRef.current && sharedConfig) {
      setConfig(withAiReviewDefaults(sharedConfig));
      setSavedConfig(withAiReviewDefaults(sharedConfig));
    }
  }, [sharedConfig, isDirty]);

  const openHooksModal = useCallback(() => {
    setIsHooksModalOpen(true);
  }, []);

  const closeHooksModal = useCallback(() => {
    setIsHooksModalOpen(false);
  }, []);

  const handleUpdateHooks = useCallback((newHooks: HookMap) => {
    const savedWithHooks = { ...savedConfig, hooks: newHooks };
    setSavedConfig(savedWithHooks);
    setConfig((current) => ({ ...current, hooks: newHooks }));
    onSave?.(savedWithHooks);
  }, [savedConfig, onSave]);

  const openIntentSourceModal = useCallback(() => {
    setIsIntentSourceModalOpen(true);
  }, []);

  const closeIntentSourceModal = useCallback(() => {
    setIsIntentSourceModalOpen(false);
  }, []);

  const handleUpdateIntentSource = useCallback((newIntentSource: IntentSourceConfig) => {
    setConfig((prev) => ({
      ...prev,
      intentSource: newIntentSource,
    }));
  }, []);

  const activeField = FIELD_ORDER[focusedFieldIndex];

  // Dynamically load available environments from useCase
  const availableEnvironments = useMemo(() => {
    const list = container?.configureEnvironmentUseCase?.getAvailableEnvironments?.();
    return list && list.length > 0
      ? list
      : ['antigravity', 'claude', 'codex', 'cursor'];
  }, [container]);

  const availableIntentSourceProviders = useMemo(() => {
    return IntentSourceFactory.getAvailableProviders();
  }, []);

  const [dynamicAgents, setDynamicAgents] = useState<string[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);

  // Dynamically query available agent models for the current environment from runner
  useEffect(() => {
    let active = true;
    setIsLoadingAgents(true);
    try {
      const useCase = container?.configureEnvironmentUseCase;
      if (useCase) {
        useCase
          .getAgentsForEnvironment(config.environment)
          .then((agents: string[]) => {
            if (active && agents && agents.length > 0) {
              setDynamicAgents(agents);
            }
          })
          .catch(() => {
            // Silently fallback if the agent query fails (e.g. runner not installed)
          })
          .finally(() => {
            if (active) setIsLoadingAgents(false);
          });
      } else {
        setIsLoadingAgents(false);
      }
    } catch {
      setIsLoadingAgents(false);
    }
    return () => {
      active = false;
    };
  }, [container, config.environment]);

  // Combined fallback + dynamic agent list
  const currentAgentOptions = useMemo(() => {
    const list = ['default', ...dynamicAgents];
    if (config.plannerAgent && !list.includes(config.plannerAgent)) {
      list.push(config.plannerAgent);
    }
    if (config.executorAgent && !list.includes(config.executorAgent)) {
      list.push(config.executorAgent);
    }
    if (config.aiReview?.agent && !list.includes(config.aiReview.agent)) {
      list.push(config.aiReview.agent);
    }
    return Array.from(new Set(list));
  }, [dynamicAgents, config.plannerAgent, config.executorAgent, config.aiReview?.agent]);

  const handleSave = useCallback(() => {
    try {
      configService.saveConfig(config);
      setSavedConfig(config);
      dirtyRef.current = false;
      setIsDirty(false);
      setFeedback({
        type: 'success',
        message: 'Configuração salva com sucesso no config.yaml!',
      });
      onSave?.(config);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({
        type: 'error',
        message: `Falha ao salvar configuração: ${msg}`,
      });
    }
  }, [config, configService, onSave]);

  const handleCycleLanguage = useCallback(
    (direction: 1 | -1) => {
      const currentIndex = LANGUAGES.findIndex((l) => l === config.language);
      const safeIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex =
        (safeIndex + direction + LANGUAGES.length) % LANGUAGES.length;
      const nextLang = LANGUAGES[nextIndex];

      setConfig((prev) => ({ ...prev, language: nextLang }));
      markDirty();
      setFeedback({
        type: 'info',
        message: `Language updated to ${nextLang}. Press 's' to save.`,
      });
    },
    [config.language, markDirty],
  );

  const handleCycleEnvironment = useCallback(
    (direction: 1 | -1) => {
      const currentIndex = availableEnvironments.indexOf(config.environment);
      const safeIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex =
        (safeIndex + direction + availableEnvironments.length) %
        availableEnvironments.length;
      const nextEnv = availableEnvironments[nextIndex];

      setConfig((prev) => ({ ...prev, environment: nextEnv }));
      markDirty();
      setFeedback({
        type: 'info',
        message: `Environment updated to ${nextEnv}. Press 's' to save.`,
      });
    },
    [availableEnvironments, config.environment, markDirty],
  );

  const handleCyclePlannerAgent = useCallback(
    (direction: 1 | -1) => {
      const currentIndex = currentAgentOptions.indexOf(config.plannerAgent);
      const safeIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex =
        (safeIndex + direction + currentAgentOptions.length) %
        currentAgentOptions.length;
      const nextAgent = currentAgentOptions[nextIndex];

      setConfig((prev) => ({ ...prev, plannerAgent: nextAgent }));
      markDirty();
      setFeedback({
        type: 'info',
        message: `Planner agent updated to ${nextAgent}. Press 's' to save.`,
      });
    },
    [currentAgentOptions, config.plannerAgent, markDirty],
  );

  const handleCycleExecutorAgent = useCallback(
    (direction: 1 | -1) => {
      const currentIndex = currentAgentOptions.indexOf(config.executorAgent);
      const safeIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex =
        (safeIndex + direction + currentAgentOptions.length) %
        currentAgentOptions.length;
      const nextAgent = currentAgentOptions[nextIndex];

      setConfig((prev) => ({ ...prev, executorAgent: nextAgent }));
      markDirty();
      setFeedback({
        type: 'info',
        message: `Executor agent updated to ${nextAgent}. Press 's' to save.`,
      });
    },
    [currentAgentOptions, config.executorAgent, markDirty],
  );

  const handleToggleAiReview = useCallback(() => {
    setConfig((prev) => {
      const review = resolveAiReviewConfig(prev.aiReview);
      return { ...prev, aiReview: { ...review, enabled: !review.enabled } };
    });
    markDirty();
    setFeedback({ type: 'info', message: "AI Review status updated. Press 's' to save." });
  }, [markDirty]);

  const handleCycleAiReviewAgent = useCallback((direction: 1 | -1) => {
    const currentAgent = resolveAiReviewConfig(config.aiReview).agent;
    const currentIndex = currentAgentOptions.indexOf(currentAgent);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextAgent = currentAgentOptions[(safeIndex + direction + currentAgentOptions.length) % currentAgentOptions.length];
    setConfig((prev) => ({
      ...prev,
      aiReview: { ...resolveAiReviewConfig(prev.aiReview), agent: nextAgent },
    }));
    markDirty();
    setFeedback({ type: 'info', message: `Reviewer agent updated to ${nextAgent}. Press 's' to save.` });
  }, [config.aiReview, currentAgentOptions, markDirty]);

  const startEditing = useCallback(() => {
    if (activeField === 'language') {
      handleCycleLanguage(1);
      return;
    }
    if (activeField === 'environment') {
      handleCycleEnvironment(1);
      return;
    }
    if (activeField === 'plannerAgent') {
      handleCyclePlannerAgent(1);
      return;
    }
    if (activeField === 'executorAgent') {
      handleCycleExecutorAgent(1);
      return;
    }
    if (activeField === 'aiReview') {
      setIsAiReviewModalOpen(true);
      return;
    }
    if (activeField === 'saveButton') {
      handleSave();
      return;
    }
    if (activeField === 'hooks') {
      openHooksModal();
      return;
    }
    if (activeField === 'intentSource') {
      openIntentSourceModal();
      return;
    }

    setEditValue('');
    setIsEditing(true);
    setFeedback(null);
  }, [
    activeField,
    handleCycleLanguage,
    handleCycleEnvironment,
    handleCyclePlannerAgent,
    handleCycleExecutorAgent,
    handleToggleAiReview,
    handleSave,
    openHooksModal,
    openIntentSourceModal,
  ]);

  const startCustomEdit = useCallback(() => {
    setEditValue('');
    setIsEditing(true);
    setFeedback(null);
  }, []);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  const commitEditing = useCallback(() => {
    const trimmed = editValue.trim();
    setConfig((prev) => {
      const updated = { ...prev };
      if (activeField === 'environment') {
        updated.environment = trimmed || prev.environment;
      } else if (activeField === 'plannerAgent') {
        updated.plannerAgent = trimmed || prev.plannerAgent;
      } else if (activeField === 'executorAgent') {
        updated.executorAgent = trimmed || prev.executorAgent;
      } else if (activeField === 'aiReview') {
        const maxRounds = Number(trimmed);
        if (!Number.isInteger(maxRounds) || maxRounds <= 0) return prev;
        updated.aiReview = { ...resolveAiReviewConfig(prev.aiReview), maxRounds };
      }
      return updated;
    });

    if (activeField === 'aiReview' && (!Number.isInteger(Number(trimmed)) || Number(trimmed) <= 0)) {
      setFeedback({ type: 'error', message: 'Maximum review rounds must be a positive integer.' });
      return;
    }

    markDirty();
    setIsEditing(false);
    setFeedback({
      type: 'info',
      message: `Updated ${activeField}. Press 's' to persist to config.yaml.`,
    });
  }, [activeField, editValue, markDirty]);

  return {
    config,
    savedConfig,
    setConfig,
    focusedFieldIndex,
    setFocusedFieldIndex,
    activeField,
    isEditing,
    setIsEditing,
    editValue,
    setEditValue,
    feedback,
    setFeedback,
    isDirty,
    setIsDirty,
    availableEnvironments,
    currentAgentOptions,
    isLoadingAgents,
    isHooksModalOpen,
    isAiReviewModalOpen,
    openAiReviewModal: () => setIsAiReviewModalOpen(true),
    closeAiReviewModal: () => setIsAiReviewModalOpen(false),
    handleUpdateAiReview: (review: ReturnType<typeof resolveAiReviewConfig>) => {
      setConfig((prev) => ({ ...prev, aiReview: review }));
      markDirty();
    },
    openHooksModal,
    closeHooksModal,
    handleUpdateHooks,
    isIntentSourceModalOpen,    openIntentSourceModal,    closeIntentSourceModal,    handleUpdateIntentSource,    availableIntentSourceProviders,    configService,
    handleSave,
    handleCycleLanguage,
    handleCycleEnvironment,
    handleCyclePlannerAgent,
    handleCycleExecutorAgent,
    handleToggleAiReview,
    handleCycleAiReviewAgent,
    startEditing,
    startCustomEdit,
    cancelEditing,
    commitEditing,
  };
}
