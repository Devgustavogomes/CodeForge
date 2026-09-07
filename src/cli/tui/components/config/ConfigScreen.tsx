import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { useNavigation } from "../../context/NavigationContext.js";
import { useTerminalDimensions } from "../../hooks/useTerminalDimensions.js";
import {
  AppContainer,
  createAppContainer,
} from "../../../../infrastructure/container.js";
import { ConfigService } from "../../../../config/ConfigService.js";
import {
  CodeForgeConfig,
  SupportedLanguage,
} from "../../../../config/types.js";
import { HookDefinition } from "../../../../domain/hook.js";

export interface ConfigScreenProps {
  container?: AppContainer;
  configService?: ConfigService;
  initialConfig?: CodeForgeConfig;
  onSave?: (config: CodeForgeConfig) => void;
  isInteractive?: boolean;
}

const LANGUAGES: SupportedLanguage[] = ["en", "pt", "es"];

type ConfigFieldKey =
  | "language"
  | "environment"
  | "plannerAgent"
  | "executorAgent"
  | "preRunHook"
  | "postRunHook"
  | "saveButton";

const FIELD_ORDER: ConfigFieldKey[] = [
  "language",
  "environment",
  "plannerAgent",
  "executorAgent",
  "preRunHook",
  "postRunHook",
  "saveButton",
];

export const ConfigScreen: React.FC<ConfigScreenProps> = ({
  container: propContainer,
  configService: propConfigService,
  initialConfig,
  onSave,
  isInteractive = true,
}) => {
  let nav: ReturnType<typeof useNavigation> | undefined;
  try {
    nav = useNavigation();
  } catch {
    // Graceful fallback outside NavigationProvider
  }

  const setTextInputActive = nav?.setTextInputActive;
  const { breakpoint } = useTerminalDimensions();

  const container = useMemo(
    () => propContainer ?? createAppContainer(),
    [propContainer],
  );
  const configService = useMemo(
    () => propConfigService ?? container.configService,
    [propConfigService, container],
  );

  const [config, setConfig] = useState<CodeForgeConfig>(() => {
    if (initialConfig) return initialConfig;
    return (
      configService.loadConfig() ?? {
        environment: "antigravity",
        plannerAgent: "default",
        executorAgent: "default",
        language: "en",
      }
    );
  });

  const [focusedFieldIndex, setFocusedFieldIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const activeField = FIELD_ORDER[focusedFieldIndex];

  // Dynamically load available environments from useCase
  const availableEnvironments = useMemo(() => {
    try {
      const list =
        container.configureEnvironmentUseCase.getAvailableEnvironments();
      return list && list.length > 0
        ? list
        : ["antigravity", "claude", "codex", "cursor"];
    } catch {
      return ["antigravity", "claude", "codex", "cursor"];
    }
  }, [container]);

  const [dynamicAgents, setDynamicAgents] = useState<string[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);

  // Dynamically query available agent models for the current environment from the runner (e.g. agy models, claude, codex)
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
    const set = new Set<string>(["default"]);

    // If runner returned dynamic models (e.g. agy models -> gemini-2.5-pro, gemini-2.5-flash, etc.):
    if (dynamicAgents.length > 0) {
      for (const agent of dynamicAgents) {
        if (agent) set.add(agent);
      }
    } else {
      // Dynamic fallbacks matching runner specs (Gemini for Antigravity, Sonnet/Opus for Claude, etc.)
      if (config.environment === "antigravity") {
        set.add("gemini-2.5-pro");
        set.add("gemini-2.5-flash");
        set.add("gemini-1.5-pro");
        set.add("gemini-1.5-flash");
      } else if (config.environment === "claude") {
        set.add("claude-3-7-sonnet");
        set.add("claude-3-5-sonnet");
        set.add("claude-3-5-haiku");
      } else if (config.environment === "codex") {
        set.add("gpt-5.6-sol");
        set.add("gpt-5.6-terra");
        set.add("gpt-4o");
        set.add("o3-mini");
      } else if (config.environment === "cursor") {
        set.add("composer");
        set.add("claude-3-5-sonnet");
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

  // Helper to extract hook command string
  const getHookCommand = useCallback(
    (hookName: "run.started" | "run.completed"): string => {
      const hookEntry = config.hooks?.[hookName];
      if (!hookEntry) return "";
      if (Array.isArray(hookEntry)) {
        return hookEntry.map((h) => h.run).join(" && ");
      }
      return "";
    },
    [config.hooks],
  );

  // Sync text input active state with NavigationContext
  useEffect(() => {
    setTextInputActive?.(isEditing);
    return () => {
      setTextInputActive?.(false);
    };
  }, [isEditing, setTextInputActive]);

  // Handle saving config
  const handleSave = useCallback(() => {
    try {
      configService.saveConfig(config);
      setIsDirty(false);
      setFeedback({
        type: "success",
        message: "Configuration successfully saved to config.yaml!",
      });
      if (onSave) {
        onSave(config);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({
        type: "error",
        message: `Failed to save configuration: ${msg}`,
      });
    }
  }, [configService, config, onSave]);

  // Handle cycle language
  const handleCycleLanguage = useCallback(
    (direction: 1 | -1 = 1) => {
      const currentIdx = LANGUAGES.indexOf(config.language);
      const nextIdx =
        (currentIdx + direction + LANGUAGES.length) % LANGUAGES.length;
      const nextLang = LANGUAGES[nextIdx];
      setConfig((prev) => ({ ...prev, language: nextLang }));
      setIsDirty(true);
      setFeedback({
        type: "info",
        message: `Language changed to "${nextLang}". Press 's' to save.`,
      });
    },
    [config.language],
  );

  // Handle cycle environment
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
        type: "info",
        message: `Environment changed to "${nextEnv}". Press 's' to save.`,
      });
    },
    [availableEnvironments, config.environment],
  );

  // Handle cycle planner agent
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
        type: "info",
        message: `Planner agent changed to "${nextAgent}". Press 's' to save.`,
      });
    },
    [config.plannerAgent, currentAgentOptions],
  );

  // Handle cycle executor agent
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
        type: "info",
        message: `Executor agent changed to "${nextAgent}". Press 's' to save.`,
      });
    },
    [config.executorAgent, currentAgentOptions],
  );

  // Start editing text field - starts with EMPTY editValue so user doesn't have to backspace
  const startEditing = useCallback(() => {
    if (activeField === "language") {
      handleCycleLanguage(1);
      return;
    }
    if (activeField === "environment") {
      handleCycleEnvironment(1);
      return;
    }
    if (activeField === "plannerAgent") {
      handleCyclePlannerAgent(1);
      return;
    }
    if (activeField === "executorAgent") {
      handleCycleExecutorAgent(1);
      return;
    }
    if (activeField === "saveButton") {
      handleSave();
      return;
    }

    // For hooks, start with empty editValue so placeholder is used and no deletion needed
    setEditValue("");
    setIsEditing(true);
    setFeedback(null);
  }, [
    activeField,
    handleCycleLanguage,
    handleCycleEnvironment,
    handleCyclePlannerAgent,
    handleCycleExecutorAgent,
    handleSave,
  ]);

  // Custom text input for agent or hook
  const startCustomEdit = useCallback(() => {
    setEditValue("");
    setIsEditing(true);
    setFeedback(null);
  }, []);

  // Commit editing text field
  const commitEditing = useCallback(() => {
    const trimmed = editValue.trim();
    setConfig((prev) => {
      const updated = { ...prev };
      if (activeField === "environment") {
        updated.environment = trimmed || prev.environment;
      } else if (activeField === "plannerAgent") {
        updated.plannerAgent = trimmed || prev.plannerAgent;
      } else if (activeField === "executorAgent") {
        updated.executorAgent = trimmed || prev.executorAgent;
      } else if (activeField === "preRunHook") {
        const cmd = trimmed || getHookCommand("run.started");
        const list: HookDefinition[] = cmd
          ? [{ name: "run-started-hook", run: cmd, type: "notify" }]
          : [];
        updated.hooks = {
          ...(updated.hooks || {}),
          "run.started": list.length > 0 ? list : undefined,
        };
      } else if (activeField === "postRunHook") {
        const cmd = trimmed || getHookCommand("run.completed");
        const list: HookDefinition[] = cmd
          ? [{ name: "run-completed-hook", run: cmd, type: "notify" }]
          : [];
        updated.hooks = {
          ...(updated.hooks || {}),
          "run.completed": list.length > 0 ? list : undefined,
        };
      }
      return updated;
    });

    setIsDirty(true);
    setIsEditing(false);
    setFeedback({
      type: "info",
      message: `Updated ${activeField}. Press 's' to persist to config.yaml.`,
    });
  }, [activeField, editValue, getHookCommand]);

  // Keyboard controls
  useInput(
    (input, key) => {
      if (!isInteractive) return;

      // When actively editing a text field
      if (isEditing) {
        if (key.escape) {
          setIsEditing(false);
          return;
        }
        if (key.return || input === "\r" || input === "\n") {
          commitEditing();
          return;
        }
        if (
          key.backspace ||
          key.delete ||
          input === "\x08" ||
          input === "\x7f"
        ) {
          setEditValue((prev) => prev.slice(0, -1));
          return;
        }
        if (key.ctrl && input === "u") {
          setEditValue("");
          return;
        }
        if (!key.ctrl && !key.meta) {
          const printable = input
            .split("")
            .filter((ch) => {
              const code = ch.charCodeAt(0);
              return (code >= 32 && code !== 127) || code > 127;
            })
            .join("");

          if (printable.length > 0) {
            setEditValue((prev) => prev + printable);
          }
        }
        return;
      }

      if (nav?.isTextInputActive) return;

      // Navigate form fields: Up/Down or k/j
      if (key.upArrow || input === "k") {
        setFocusedFieldIndex((prev) =>
          prev > 0 ? prev - 1 : FIELD_ORDER.length - 1,
        );
        setFeedback(null);
        return;
      }
      if (key.downArrow || input === "j" || key.tab) {
        setFocusedFieldIndex((prev) =>
          prev < FIELD_ORDER.length - 1 ? prev + 1 : 0,
        );
        setFeedback(null);
        return;
      }

      // Quick cycle with Space or Left/Right
      if (activeField === "language") {
        if (key.leftArrow) {
          handleCycleLanguage(-1);
          return;
        }
        if (key.rightArrow || input === " ") {
          handleCycleLanguage(1);
          return;
        }
      }

      if (activeField === "environment") {
        if (key.leftArrow) {
          handleCycleEnvironment(-1);
          return;
        }
        if (key.rightArrow || input === " ") {
          handleCycleEnvironment(1);
          return;
        }
      }

      if (activeField === "plannerAgent") {
        if (key.leftArrow) {
          handleCyclePlannerAgent(-1);
          return;
        }
        if (key.rightArrow || input === " ") {
          handleCyclePlannerAgent(1);
          return;
        }
        if (input === "e") {
          startCustomEdit();
          return;
        }
      }

      if (activeField === "executorAgent") {
        if (key.leftArrow) {
          handleCycleExecutorAgent(-1);
          return;
        }
        if (key.rightArrow || input === " ") {
          handleCycleExecutorAgent(1);
          return;
        }
        if (input === "e") {
          startCustomEdit();
          return;
        }
      }

      // 's' or 'S' -> Save config
      if (input === "s" || input === "S") {
        handleSave();
        return;
      }

      // Enter -> Cycle or edit
      if (key.return || input === "\r" || input === "\n") {
        startEditing();
        return;
      }
    },
    { isActive: isInteractive },
  );

  const isSideBySide = breakpoint !== "minimal";

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      {/* Main Container */}
      <Box flexDirection={isSideBySide ? "row" : "column"} width="100%" flexGrow={1}>
        {/* Left Column: Form Fields */}
        <Box
          flexDirection="column"
          width={isSideBySide ? "55%" : "100%"}
          borderStyle="round"
          borderColor="white"
          paddingX={1}
          paddingY={1}
        >
          <Box justifyContent="space-between" marginBottom={1}>
            <Text bold color="white">
              CodeForge Configuration Editor
            </Text>
            {isDirty && (
              <Text color="yellow" bold>
                ● Unsaved Changes
              </Text>
            )}
          </Box>

          {/* Feedback banner */}
          {feedback && (
            <Box
              marginBottom={1}
              paddingX={1}
              borderStyle="single"
              borderColor={
                feedback.type === "success"
                  ? "green"
                  : feedback.type === "error"
                    ? "red"
                    : "yellow"
              }
            >
              <Text
                color={
                  feedback.type === "success"
                    ? "green"
                    : feedback.type === "error"
                      ? "red"
                      : "yellow"
                }
                bold
              >
                {feedback.message}
              </Text>
            </Box>
          )}

          {/* 1. Language */}
          <Box justifyContent="space-between" width="100%">
            <Box gap={1}>
              <Text bold color={activeField === "language" ? "cyan" : "white"}>
                1. Language (i18n):
              </Text>
              <Box gap={1}>
                {LANGUAGES.map((lang) => {
                  const isSelected = config.language === lang;
                  return (
                    <Text
                      key={lang}
                      color={isSelected ? "cyan" : "gray"}
                      bold={isSelected}
                    >
                      {isSelected ? `● [${lang}]` : `○ ${lang}`}
                    </Text>
                  );
                })}
              </Box>
            </Box>
            {activeField === "language" && <Text dimColor>[Space] toggle</Text>}
          </Box>

          {/* 2. Environment */}
          <Box justifyContent="space-between" width="100%">
            <Box gap={1} flexShrink={1}>
              <Text
                bold
                color={activeField === "environment" ? "cyan" : "white"}
              >
                2. Runner Environment:
              </Text>
              <Box gap={1}>
                <Text color="cyan" bold>
                  ◀ [ {config.environment} ] ▶
                </Text>
                {availableEnvironments.length > 1 && (
                  <Text dimColor>
                    (
                    {Math.max(
                      1,
                      availableEnvironments.indexOf(config.environment) + 1,
                    )}
                    /{availableEnvironments.length})
                  </Text>
                )}
              </Box>
            </Box>
            {activeField === "environment" && (
              <Text dimColor>[Space/←/→] toggle</Text>
            )}
          </Box>

          {/* 3. Planner Agent */}
          <Box justifyContent="space-between" width="100%">
            <Box gap={1} flexShrink={1}>
              <Text
                bold
                color={activeField === "plannerAgent" ? "cyan" : "white"}
              >
                3. Planner Agent Model:
              </Text>
              {isEditing && activeField === "plannerAgent" ? (
                <Box gap={1}>
                  <Text color="blue" bold>
                    {"> "}
                  </Text>
                  {editValue.length > 0 ? (
                    <Text color="white" bold>
                      {editValue}█
                    </Text>
                  ) : (
                    <Box gap={1}>
                      <Text color="cyan">█</Text>
                      <Text dimColor>({config.plannerAgent})</Text>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box gap={1}>
                  <Text color="cyan" bold>
                    ◀ [ {config.plannerAgent} ] ▶
                  </Text>
                  {currentAgentOptions.length > 1 && (
                    <Text dimColor>
                      (
                      {Math.max(
                        1,
                        currentAgentOptions.indexOf(config.plannerAgent) + 1,
                      )}
                      /{currentAgentOptions.length})
                    </Text>
                  )}
                </Box>
              )}
            </Box>
            {activeField === "plannerAgent" && !isEditing && (
              <Text dimColor>[Space/←/→] · [e] edit</Text>
            )}
          </Box>

          {/* 4. Executor Agent */}
          <Box justifyContent="space-between" width="100%">
            <Box gap={1} flexShrink={1}>
              <Text
                bold
                color={activeField === "executorAgent" ? "cyan" : "white"}
              >
                4. Executor Agent Model:
              </Text>
              {isEditing && activeField === "executorAgent" ? (
                <Box gap={1}>
                  <Text color="blue" bold>
                    {"> "}
                  </Text>
                  {editValue.length > 0 ? (
                    <Text color="white" bold>
                      {editValue}█
                    </Text>
                  ) : (
                    <Box gap={1}>
                      <Text color="cyan">█</Text>
                      <Text dimColor>({config.executorAgent})</Text>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box gap={1}>
                  <Text color="cyan" bold>
                    ◀ [ {config.executorAgent} ] ▶
                  </Text>
                  {currentAgentOptions.length > 1 && (
                    <Text dimColor>
                      (
                      {Math.max(
                        1,
                        currentAgentOptions.indexOf(config.executorAgent) + 1,
                      )}
                      /{currentAgentOptions.length})
                    </Text>
                  )}
                </Box>
              )}
            </Box>
            {activeField === "executorAgent" && !isEditing && (
              <Text dimColor>[Space/←/→] · [e] edit</Text>
            )}
          </Box>

          {/* 5. Pre-run Hook */}
          <Box justifyContent="space-between" width="100%">
            <Box gap={1} flexShrink={1}>
              <Text
                bold
                color={activeField === "preRunHook" ? "cyan" : "white"}
              >
                5. Pre-Run Hook:
              </Text>
              {isEditing && activeField === "preRunHook" ? (
                <Box gap={1}>
                  <Text color="blue" bold>
                    {"> "}
                  </Text>
                  {editValue.length > 0 ? (
                    <Text color="white" bold wrap="truncate-end">
                      {editValue}█
                    </Text>
                  ) : (
                    <Box gap={1}>
                      <Text color="cyan">█</Text>
                      <Text dimColor wrap="truncate-end">
                        {getHookCommand("run.started") ||
                          "e.g. npm run test:fast"}
                      </Text>
                    </Box>
                  )}
                </Box>
              ) : (
                <Text color="white" wrap="truncate-end">
                  {getHookCommand("run.started") || "(None)"}
                </Text>
              )}
            </Box>
            {activeField === "preRunHook" && !isEditing && (
              <Text dimColor>[Enter] edit</Text>
            )}
          </Box>

          {/* 6. Post-run Hook */}
          <Box justifyContent="space-between" width="100%">
            <Box gap={1} flexShrink={1}>
              <Text
                bold
                color={activeField === "postRunHook" ? "cyan" : "white"}
              >
                6. Post-Run Hook:
              </Text>
              {isEditing && activeField === "postRunHook" ? (
                <Box gap={1}>
                  <Text color="blue" bold>
                    {"> "}
                  </Text>
                  {editValue.length > 0 ? (
                    <Text color="white" bold wrap="truncate-end">
                      {editValue}█
                    </Text>
                  ) : (
                    <Box gap={1}>
                      <Text color="cyan">█</Text>
                      <Text dimColor wrap="truncate-end">
                        {getHookCommand("run.completed") || "e.g. echo done"}
                      </Text>
                    </Box>
                  )}
                </Box>
              ) : (
                <Text color="white" wrap="truncate-end">
                  {getHookCommand("run.completed") || "(None)"}
                </Text>
              )}
            </Box>
            {activeField === "postRunHook" && !isEditing && (
              <Text dimColor>[Enter] edit</Text>
            )}
          </Box>

          {/* 7. Save Action Button */}
          <Box
            marginTop={1}
            borderStyle="single"
            borderColor={activeField === "saveButton" ? "green" : "gray"}
            paddingX={1}
            justifyContent="center"
          >
            <Text color={activeField === "saveButton" ? "green" : "white"} bold>
              [ Save Configuration to config.yaml ]
            </Text>
          </Box>
        </Box>

        {/* Right Column: Dynamic Inspector & Preview */}
        <Box
          flexDirection="column"
          width={isSideBySide ? "45%" : "100%"}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          {/* Contextual Options List */}
          {activeField === "plannerAgent" || activeField === "executorAgent" ? (
            <Box flexDirection="column" marginBottom={1}>
              <Box justifyContent="space-between" marginBottom={0}>
                <Text bold color="cyan">
                  {activeField === "plannerAgent" ? "Planner" : "Executor"}{" "}
                  Models ({config.environment})
                </Text>
                {isLoadingAgents && <Text color="yellow">⏳</Text>}
              </Box>
              <Box flexDirection="column" marginY={0}>
                {currentAgentOptions.slice(0, 6).map((opt) => {
                  const isCurrent =
                    (activeField === "plannerAgent"
                      ? config.plannerAgent
                      : config.executorAgent) === opt;
                  return (
                    <Box key={opt} gap={1}>
                      <Text
                        color={isCurrent ? "cyan" : "gray"}
                        bold={isCurrent}
                      >
                        {isCurrent ? "❯ ●" : "  ○"}
                      </Text>
                      <Text
                        color={isCurrent ? "cyan" : "white"}
                        bold={isCurrent}
                        wrap="truncate-end"
                      >
                        {opt}
                      </Text>
                    </Box>
                  );
                })}
                {currentAgentOptions.length > 6 && (
                  <Text dimColor>
                    {" "}
                    ...and {currentAgentOptions.length - 6} more
                  </Text>
                )}
              </Box>
            </Box>
          ) : activeField === "environment" ? (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="cyan">
                Runner Environments
              </Text>
              <Box flexDirection="column" marginY={0}>
                {availableEnvironments.map((env) => {
                  const isCurrent = config.environment === env;
                  return (
                    <Box key={env} gap={1}>
                      <Text
                        color={isCurrent ? "cyan" : "gray"}
                        bold={isCurrent}
                      >
                        {isCurrent ? "❯ ●" : "  ○"}
                      </Text>
                      <Text
                        color={isCurrent ? "cyan" : "white"}
                        bold={isCurrent}
                      >
                        {env}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="cyan">
                Configuration Preview
              </Text>
              <Text dimColor>Language: {config.language}</Text>
              <Text dimColor>Runner: {config.environment}</Text>
              <Text dimColor>Planner Model: {config.plannerAgent}</Text>
              <Text dimColor>Executor Model: {config.executorAgent}</Text>
              <Text dimColor>
                Hooks:{" "}
                {
                  Object.values(config.hooks || {}).filter(
                    (v) => Array.isArray(v) && v.length > 0,
                  ).length
                }{" "}
                active
              </Text>
            </Box>
          )}

          <Box
            marginTop={1}
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            flexDirection="column"
          >
            <Text bold color="white">
              Navigation Shortcuts:
            </Text>
            <Text dimColor>[↑/↓] or [Tab] Select Field</Text>
            <Text dimColor>[Space/←/→] Cycle Option</Text>
            <Text dimColor>[e] Custom Edit</Text>
            <Text dimColor>[s] Quick Save to File</Text>
            <Text dimColor>[Esc] Cancel Edit</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
