import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppContainer } from '../../../../../infrastructure/container.js';
import { HookMap } from '../../../../../domain/hook.js';
import { SpecSourceConfig } from '../../../../../domain/spec-source.js';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { CliInstallResult, OnboardingState } from '../hooks/useOnboardingWizard.js';
import { CliInstaller } from '../../../../installer/CliInstaller.js';
import { Spinner } from '../../common/Spinner.js';
import { theme } from '../../../theme.js';

export interface SummaryStepProps {
  container: AppContainer;
  state?: OnboardingState;
  specSource?: SpecSourceConfig;
  environment?: string;
  plannerAgent?: string;
  executorAgent?: string;
  hooks?: HookMap;
  cliInstallResult?: CliInstallResult;
  isInitializing?: boolean;
  error?: string;
  onComplete?: () => void;
  onNext?: () => void;
  onBack?: () => void;
  onStartInitialization?: () => void;
  onFinishInitialization?: (error?: string) => void;
  onInitializingChange?: (isInitializing: boolean) => void;
  onErrorChange?: (error?: string) => void;
  onOperationActiveChange?: (isActive: boolean) => void;
  onFormActiveChange?: (isActive: boolean) => void;
  isActive?: boolean;
  isInteractive?: boolean;
  celebrationDurationMs?: number;
}

export function formatSpecSourceDisplay(source?: SpecSourceConfig): string {
  if (!source || !source.provider) {
    return 'Local (.codeforge/specs/)';
  }
  const provider = source.provider.toLowerCase();
  if (provider === 'local' || provider === 'filesystem') {
    return 'Local (.codeforge/specs/)';
  }
  if (provider === 'github') {
    return source.project ? `GitHub (${source.project})` : 'GitHub Issues / Projects';
  }
  if (provider === 'linear') {
    return source.team ? `Linear (${source.team})` : 'Linear';
  }
  if (provider === 'clickup') {
    return source.project ? `ClickUp (${source.project})` : 'ClickUp';
  }
  return source.provider;
}

export function formatCliStatusDisplay(
  environment: string,
  result?: CliInstallResult,
): { text: string; color: string } {
  if (result?.message) {
    return {
      text: result.message,
      color: result.success ? theme.colors.success : theme.colors.warning,
    };
  }
  if (result) {
    return {
      text: result.success ? '✔ CLI detectada no sistema' : 'Instalação pendente',
      color: result.success ? theme.colors.success : theme.colors.warning,
    };
  }
  const installCommand = CliInstaller.getInstallCommand(environment);
  if (!installCommand) {
    return {
      text: 'Este ambiente não requer uma CLI externa.',
      color: theme.colors.muted,
    };
  }
  return {
    text: '✔ CLI detectada no sistema',
    color: theme.colors.success,
  };
}

const CELEBRATION_FRAMES = [
  [
    '         *         .      *       *',
    '   .      / \\     .       .      *     .',
    '      ---/---\\-------------------',
    '     [ FORJA CONCLUÍDA COM SUCESSO ]',
    '      ---\\---/-------------------',
    '   *      \\ /        *       .         *',
    '         *         .      *       *',
  ],
  [
    '   .      *         *      .       *',
    '       .   \\ /        .     *       .',
    '      ---/---\\-------------------',
    '     [ FORJA CONCLUÍDA COM SUCESSO ]',
    '      ---\\---/-------------------',
    '   .      / \\        .       *         .',
    '   *      .         *      *       .',
  ],
  [
    '       *        .       *        .',
    '   *      / \\     *       .      *',
    '      ---/---\\-------------------',
    '     [ FORJA CONCLUÍDA COM SUCESSO ]',
    '      ---\\---/-------------------',
    '   .      \\ /        *       .      *',
    '       .        *       .        *',
  ],
] as const;

const CELEBRATION_COLORS = [
  theme.colors.warning,
  theme.colors.accent,
  theme.colors.primary,
  theme.colors.success,
  theme.colors.primary,
  theme.colors.accent,
  theme.colors.warning,
] as const;

export const SummaryStep: React.FC<SummaryStepProps> = ({
  container,
  state,
  specSource,
  environment,
  plannerAgent,
  executorAgent,
  hooks,
  cliInstallResult,
  isInitializing: propIsInitializing,
  error: propError,
  onComplete,
  onNext,
  onBack,
  onStartInitialization,
  onFinishInitialization,
  onInitializingChange,
  onErrorChange,
  onOperationActiveChange,
  onFormActiveChange,
  isActive = true,
  isInteractive,
  celebrationDurationMs = 1200,
}) => {
  const interactive = isInteractive ?? isActive;

  const currentSpecSource = useMemo(
    () => specSource ?? state?.specSource ?? { provider: 'local' },
    [specSource, state?.specSource],
  );
  const currentEnvironment = environment ?? state?.environment ?? 'local';
  const currentPlannerAgent = plannerAgent ?? state?.plannerAgent ?? 'default';
  const currentExecutorAgent = executorAgent ?? state?.executorAgent ?? 'default';
  const currentHooks = useMemo(
    () => hooks ?? state?.hooks ?? {},
    [hooks, state?.hooks],
  );
  const currentCliResult = cliInstallResult ?? state?.cliInstallResult;

  const [localIsInitializing, setLocalIsInitializing] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [isSuccess, setIsSuccess] = useState(false);
  const [celebrationFrameIndex, setCelebrationFrameIndex] = useState(0);

  const isInitializing = propIsInitializing ?? state?.isInitializing ?? localIsInitializing;
  const error = propError ?? state?.error ?? localError;

  const isForgingRef = useRef(false);
  const completedRef = useRef(false);

  const totalHooks = useMemo(() => {
    return Object.values(currentHooks).reduce(
      (total, list) => total + (list?.length ?? 0),
      0,
    );
  }, [currentHooks]);

  const cliStatus = useMemo(
    () => formatCliStatusDisplay(currentEnvironment, currentCliResult),
    [currentEnvironment, currentCliResult],
  );

  useEffect(() => {
    onFormActiveChange?.(false);
  }, [onFormActiveChange]);

  useEffect(() => {
    if (!isSuccess) return;

    const interval = setInterval(() => {
      setCelebrationFrameIndex((prev) => (prev + 1) % CELEBRATION_FRAMES.length);
    }, 150);

    return () => clearInterval(interval);
  }, [isSuccess]);

  useEffect(() => {
    if (!isSuccess) return;

    const timer = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        const finish = onComplete ?? onNext;
        finish?.();
      }
    }, celebrationDurationMs);

    return () => {
      clearTimeout(timer);
    };
  }, [isSuccess, celebrationDurationMs, onComplete, onNext]);

  const handleForge = useCallback(async () => {
    if (isForgingRef.current || isInitializing || isSuccess) {
      return;
    }

    isForgingRef.current = true;
    setLocalIsInitializing(true);
    setLocalError(undefined);
    onStartInitialization?.();
    onInitializingChange?.(true);
    onErrorChange?.(undefined);
    onOperationActiveChange?.(true);

    try {
      // 1. Inicializar a estrutura do workspace
      await Promise.resolve(container.initializeWorkspaceUseCase.execute());

      // 2. Persistir a configuração sem descartar configurações prévias não sobrescritas
      const existingConfig = container.configService.loadConfig();

      const normalizedProvider =
        currentSpecSource.provider.toLowerCase() === 'local'
          ? 'filesystem'
          : currentSpecSource.provider;

      const specSourceToSave: SpecSourceConfig = {
        ...currentSpecSource,
        provider: normalizedProvider,
      };

      const configToSave: Partial<CodeForgeConfig> & Record<string, unknown> = {
        ...existingConfig,
        environment: currentEnvironment,
        plannerAgent: currentPlannerAgent,
        executorAgent: currentExecutorAgent,
        specSource: specSourceToSave,
        hooks: currentHooks,
        language: existingConfig?.language ?? 'pt',
      };

      await Promise.resolve(container.configService.saveConfig(configToSave));

      setLocalIsInitializing(false);
      setIsSuccess(true);
      onFinishInitialization?.(undefined);
      onInitializingChange?.(false);
      onErrorChange?.(undefined);
    } catch (err: unknown) {
      isForgingRef.current = false;
      const message = err instanceof Error ? err.message : String(err);
      setLocalIsInitializing(false);
      setLocalError(message);
      onFinishInitialization?.(message);
      onInitializingChange?.(false);
      onErrorChange?.(message);
      onOperationActiveChange?.(false);
    }
  }, [
    isInitializing,
    isSuccess,
    container,
    currentSpecSource,
    currentEnvironment,
    currentPlannerAgent,
    currentExecutorAgent,
    currentHooks,
    onStartInitialization,
    onInitializingChange,
    onErrorChange,
    onOperationActiveChange,
    onFinishInitialization,
  ]);

  useInput(
    (input, key) => {
      if (!interactive) return;

      const isEnter = key.return || input === '\r' || input === '\n';
      const isEscape = key.escape;

      if (isSuccess) {
        if (isEnter) {
          if (!completedRef.current) {
            completedRef.current = true;
            const finish = onComplete ?? onNext;
            finish?.();
          }
        }
        return;
      }

      if (isInitializing) {
        return;
      }

      if (error) {
        if (isEnter || input.toLowerCase() === 'r') {
          void handleForge();
          return;
        }
        if (isEscape || input.toLowerCase() === 'b') {
          onBack?.();
          return;
        }
        return;
      }

      if (isEscape || input.toLowerCase() === 'b') {
        onBack?.();
        return;
      }

      if (isEnter) {
        void handleForge();
      }
    },
    { isActive: interactive && !isInitializing },
  );

  return (
    <Box flexDirection="column" width="100%" gap={1}>
      <Box flexDirection="column">
        <Text bold color={theme.colors.primary}>
          Resumo da Configuração
        </Text>
        <Text color={theme.colors.text}>
          Revise as escolhas do workspace antes de forjar o ambiente do CodeForge.
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Text color={theme.colors.muted}>Fonte de especificações:</Text>
          <Text bold color={theme.colors.accent}>
            {formatSpecSourceDisplay(currentSpecSource)}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color={theme.colors.muted}>Ambiente de execução:</Text>
          <Text bold color={theme.colors.accent}>
            {currentEnvironment}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color={theme.colors.muted}>Planner Agent:</Text>
          <Text bold color={theme.colors.primary}>
            {currentPlannerAgent}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color={theme.colors.muted}>Executor Agent:</Text>
          <Text bold color={theme.colors.primary}>
            {currentExecutorAgent}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color={theme.colors.muted}>Status da CLI do ambiente:</Text>
          <Text bold color={cliStatus.color}>
            {cliStatus.text}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color={theme.colors.muted}>Quantidade total de hooks:</Text>
          <Text bold color={totalHooks > 0 ? theme.colors.accent : theme.colors.text}>
            {totalHooks} hook{totalHooks === 1 ? '' : 's'} configurado{totalHooks === 1 ? '' : 's'}
          </Text>
        </Box>
      </Box>

      {error && !isInitializing && !isSuccess && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.colors.error}
          paddingX={1}
        >
          <Text bold color={theme.colors.error}>
            Falha ao forjar o workspace:
          </Text>
          <Text color={theme.colors.error}>{error}</Text>
          <Box marginTop={1} gap={2}>
            <Text bold color={theme.colors.warning}>
              [Enter/r] Tentar novamente
            </Text>
            <Text color={theme.colors.muted}>[b/Esc] Voltar</Text>
          </Box>
        </Box>
      )}

      {isInitializing && (
        <Box marginTop={1}>
          <Spinner
            color={theme.colors.warning}
            label="Forjando workspace e gravando a configuração..."
          />
        </Box>
      )}

      {isSuccess && (
        <Box
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          width="100%"
          marginTop={1}
          gap={1}
        >
          <Box flexDirection="column" alignItems="center">
            {CELEBRATION_FRAMES[celebrationFrameIndex].map((line, idx) => (
              <Text key={idx} color={CELEBRATION_COLORS[idx % CELEBRATION_COLORS.length]} bold>
                {line}
              </Text>
            ))}
          </Box>

          <Box flexDirection="column" alignItems="center">
            <Text bold color={theme.colors.success}>
              Forja inicializada com sucesso!
            </Text>
            <Text color={theme.colors.muted}>
              Entregando o controle para a interface principal...
            </Text>
          </Box>
        </Box>
      )}

      {!isInitializing && !isSuccess && !error && (
        <Box marginTop={1} gap={2}>
          <Text bold color={theme.colors.success}>
            [Enter] Forjar Workspace
          </Text>
          <Text color={theme.colors.muted}>[b/Esc] Voltar</Text>
        </Box>
      )}
    </Box>
  );
};

export default SummaryStep;
