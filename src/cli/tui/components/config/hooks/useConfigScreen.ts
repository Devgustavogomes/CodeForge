import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { ConfigService } from '../../../../../config/ConfigService.js';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { HookMap } from '../../../../../domain/hook.js';
import { SpecSourceConfig } from '../../../../../domain/spec-source.js';
import { SpecSourceFactory } from '../../../../../infrastructure/spec-sources/SpecSourceFactory.js';
import { FIELD_ORDER, LANGUAGES } from '../components/ConfigField.js';

export interface UseConfigScreenOptions {
  container?: AppContainer;
  configService?: ConfigService;
  initialConfig?: CodeForgeConfig;
  onSave?: (config: CodeForgeConfig) => void;
}

export function useConfigScreen(options?: UseConfigScreenOptions) {
  const contextContainer = useContext(ContainerContext);
  const container = useMemo(
    () => options?.container ?? contextContainer ?? createAppContainer(),
    [options?.container, contextContainer],
  );

  const configService = useMemo(
    () => options?.configService ?? container.configService,
    [options?.configService, container],
  );

  const nav = useContext(NavigationContext);

  const [config, setConfig] = useState<CodeForgeConfig>(() => {
    if (options?.initialConfig) return options.initialConfig;
    return (
      configService.loadConfig() ?? {
        environment: 'antigravity',
        plannerAgent: 'default',
        executorAgent: 'default',
        language: 'en',
      }
    );
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
  const [isSpecSourceModalOpen, setIsSpecSourceModalOpen] = useState(false);

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

  const openSpecSourceModal = useCallback(() => {
    setIsSpecSourceModalOpen(true);
  }, []);

  const closeSpecSourceModal = useCallback(() => {
    setIsSpecSourceModalOpen(false);
  }, []);

  const handleUpdateSpecSource = useCallback((newSpecSource: SpecSourceConfig) => {
    setConfig((prev) => ({
      ...prev,
      specSource: newSpecSource,
    }));
  }, []);

  const activeField = FIELD_ORDER[focusedFieldIndex];

  // Dynamically load available environments from useCase
  const availableEnvironments = useMemo(() => {
    const list = container.configureEnvironmentUseCase.getAvailableEnvironments();
    return list && list.length > 0
      ? list
      : ['antigravity', 'claude', 'codex', 'cursor'];
  }, [container]);

  const availableSpecSourceProviders = useMemo(() => {
    return SpecSourceFactory.getAvailableProviders();
  }, []);

  const [dynamicAgents, setDynamicAgents] = useState<string[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);

  // Dynamically query available agent models for the current environment from runner
  useEffect(() => {
    let active = true;
    setIsLoadingAgents(true);
    try {
      const useCase = container.configureEnvironmentUseCase;
      if (useCase) {
        useCase
          .getAgentsForEnvironment(config.environment)
          .then((agents) => {
            if (active) {
              if (Array.isArray(agents) && agents.length > 0) {
                setDynamicAgents(agents);
              } else {
                setDynamicAgents([]);
              }
              setIsLoadingAgents(false);
            }
          })
          .catch(() => {
            if (active) {
              setDynamicAgents([]);
              setIsLoadingAgents(false);
            }
          });
      }
    } catch {
      if (active) {
        setDynamicAgents([]);
        setIsLoadingAgents(false);
      }
    }
    return () => {
      active = false;
    };
  }, [container, config.environment]);

  // Options for agents per environment
  const currentAgentOptions = useMemo(() => {
    const set = new Set<string>(['default']);

    if (dynamicAgents.length > 0) {
      for (const agent of dynamicAgents) {
        if (agent) set.add(agent);
      }
    } else {
      if (config.environment === 'antigravity') {
        set.add('gemini-2.5-pro');
        set.add('gemini-2.5-flash');
        set.add('gemini-1.5-pro');
        set.add('gemini-1.5-flash');
      } else if (config.environment === 'claude') {
        set.add('claude-3-7-sonnet');
        set.add('claude-3-5-sonnet');
        set.add('claude-3-5-haiku');
      } else if (config.environment === 'codex') {
        set.add('gpt-5.6-sol');
        set.add('gpt-5.6-terra');
        set.add('gpt-4o');
        set.add('o3-mini');
      } else if (config.environment === 'cursor') {
        set.add('composer');
        set.add('claude-3-5-sonnet');
      }
    }

    if (config.plannerAgent) {
      set.add(config.plannerAgent);
    }
    if (config.executorAgent) {
      set.add(config.executorAgent);
    }
    return Array.from(set);
  }, [
    config.environment,
    dynamicAgents,
    config.plannerAgent,
    config.executorAgent,
  ]);


  useEffect(() => {
    nav?.setTextInputActive?.(isEditing);
    return () => {
      nav?.setTextInputActive?.(false);
    };
  }, [isEditing, nav]);

  const handleSave = useCallback(() => {
    try {
      configService.saveConfig(config);
      setIsDirty(false);
      setFeedback({
        type: 'success',
        message: 'Configuration successfully saved to config.yaml!',
      });
      if (options?.onSave) {
        options.onSave(config);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({
        type: 'error',
        message: `Failed to save configuration: ${msg}`,
      });
    }
  }, [configService, config, options]);

  const handleCycleLanguage = useCallback(
    (direction: 1 | -1 = 1) => {
      const currentIdx = LANGUAGES.indexOf(config.language);
      const nextIdx =
        (currentIdx + direction + LANGUAGES.length) % LANGUAGES.length;
      const nextLang = LANGUAGES[nextIdx];
      setConfig((prev) => ({ ...prev, language: nextLang }));
      setIsDirty(true);
      setFeedback({
        type: 'info',
        message: `Language changed to "${nextLang}". Press 's' to save.`,
      });
    },
    [config.language],
  );

  const handleCycleEnvironment = useCallback(
    (direction: 1 | -1 = 1) => {
      const currentIdx = availableEnvironments.indexOf(config.environment);
      const nextIdx =
        (currentIdx + direction + availableEnvironments.length) %
        availableEnvironments.length;
      const nextEnv = availableEnvironments[nextIdx];
      setConfig((prev) => ({ ...prev, environment: nextEnv }));
      setIsDirty(true);
      setFeedback({
        type: 'info',
        message: `Environment changed to "${nextEnv}". Press 's' to save.`,
      });
    },
    [availableEnvironments, config.environment],
  );

  const handleCyclePlannerAgent = useCallback(
    (direction: 1 | -1 = 1) => {
      const currentIdx = currentAgentOptions.indexOf(config.plannerAgent);
      const nextIdx =
        (currentIdx + direction + currentAgentOptions.length) %
        currentAgentOptions.length;
      const nextAgent = currentAgentOptions[nextIdx];
      setConfig((prev) => ({ ...prev, plannerAgent: nextAgent }));
      setIsDirty(true);
      setFeedback({
        type: 'info',
        message: `Planner agent changed to "${nextAgent}". Press 's' to save.`,
      });
    },
    [config.plannerAgent, currentAgentOptions],
  );

  const handleCycleExecutorAgent = useCallback(
    (direction: 1 | -1 = 1) => {
      const currentIdx = currentAgentOptions.indexOf(config.executorAgent);
      const nextIdx =
        (currentIdx + direction + currentAgentOptions.length) %
        currentAgentOptions.length;
      const nextAgent = currentAgentOptions[nextIdx];
      setConfig((prev) => ({ ...prev, executorAgent: nextAgent }));
      setIsDirty(true);
      setFeedback({
        type: 'info',
        message: `Executor agent changed to "${nextAgent}". Press 's' to save.`,
      });
    },
    [config.executorAgent, currentAgentOptions],
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
    if (activeField === 'specSource') {
      openSpecSourceModal();
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
    openSpecSourceModal,
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
    isSpecSourceModalOpen,
    openSpecSourceModal,
    closeSpecSourceModal,
    handleUpdateSpecSource,
    availableSpecSourceProviders,
    configService,
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
