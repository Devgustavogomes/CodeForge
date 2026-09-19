import { useState, useCallback, useMemo, useEffect } from 'react';
import { AppContainer } from '../../../../../infrastructure/container.js';
import { NodeWorkspaceGateway } from '../../../../../infrastructure/workspace.js';
import { ConfigService } from '../../../../../config/ConfigService.js';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { FIELD_ORDER, LANGUAGES } from '../components/ConfigField.js';
import { HookMap } from '../../../../../domain/hook.js';
import { IntentSourceConfig } from '../../../../../domain/intent-source.js';
import { IntentSourceFactory } from '../../../../../infrastructure/intent-sources/IntentSourceFactory.js';

export interface UseConfigScreenOptions {
  container?: AppContainer;
  configService?: ConfigService;
  initialConfig?: CodeForgeConfig;
  onSave?: (config: CodeForgeConfig) => void;
}

export const DEFAULT_CONFIG: CodeForgeConfig = {
  language: 'en',
  environment: 'local',
  plannerAgent: 'default',
  executorAgent: 'default',
  hooks: {},
  intentSource: { provider: 'filesystem' },
};

export function useConfigScreen(options: UseConfigScreenOptions = {}) {
  const {
    container = (globalThis as unknown as { __codeforge_container?: AppContainer }).__codeforge_container!,
    configService: customConfigService,
    initialConfig,
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
    if (initialConfig) return initialConfig;
    try {
      const loaded = configService.loadConfig();
      return loaded || DEFAULT_CONFIG;
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
  const [isHooksModalOpen, setIsHooksModalOpen] = useState(false);
  const [isIntentSourceModalOpen, setIsIntentSourceModalOpen] = useState(false);

  const openHooksModal = useCallback(() => {
    setIsHooksModalOpen(true);
  }, []);

  const closeHooksModal = useCallback(() => {
    setIsHooksModalOpen(false);
  }, []);

  const handleUpdateHooks = useCallback((newHooks: HookMap) => {
    setConfig((prev) => ({
      ...prev,
      hooks: newHooks,
    }));
  }, []);

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
    return Array.from(new Set(list));
  }, [dynamicAgents, config.plannerAgent, config.executorAgent]);

  const handleSave = useCallback(() => {
    try {
      configService.saveConfig(config);
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
      setIsDirty(true);
      setFeedback({
        type: 'info',
        message: `Language updated to ${nextLang}. Press 's' to save.`,
      });
    },
    [config.language],
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
      setIsDirty(true);
      setFeedback({
        type: 'info',
        message: `Environment updated to ${nextEnv}. Press 's' to save.`,
      });
    },
    [availableEnvironments, config.environment],
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
      setIsDirty(true);
      setFeedback({
        type: 'info',
        message: `Planner agent updated to ${nextAgent}. Press 's' to save.`,
      });
    },
    [currentAgentOptions, config.plannerAgent],
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
      setIsDirty(true);
      setFeedback({
        type: 'info',
        message: `Executor agent updated to ${nextAgent}. Press 's' to save.`,
      });
    },
    [currentAgentOptions, config.executorAgent],
  );

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
      }
      return updated;
    });

    setIsDirty(true);
    setIsEditing(false);
    setFeedback({
      type: 'info',
      message: `Updated ${activeField}. Press 's' to persist to config.yaml.`,
    });
  }, [activeField, editValue]);

  return {
    config,
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
    openHooksModal,
    closeHooksModal,
    handleUpdateHooks,
    isIntentSourceModalOpen,    openIntentSourceModal,    closeIntentSourceModal,    handleUpdateIntentSource,    availableIntentSourceProviders,    configService,
    handleSave,
    handleCycleLanguage,
    handleCycleEnvironment,
    handleCyclePlannerAgent,
    handleCycleExecutorAgent,
    startEditing,
    startCustomEdit,
    cancelEditing,
    commitEditing,
  };
}
