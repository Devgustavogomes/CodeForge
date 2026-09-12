import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  CliDetectionResult,
  CliInstaller,
} from '../../../../installer/CliInstaller.js';
import { Spinner } from '../../common/Spinner.js';
import { theme } from '../../../theme.js';

export interface CliInstallStepResult {
  success: boolean;
  message?: string;
}

export interface CliInstallService {
  getInstallCommand: (environment: string) => string | null;
  detectCli: (environment: string) => Promise<CliDetectionResult>;
  installCli: (
    environment: string,
  ) => Promise<{ success: boolean; error?: Error }>;
}

export interface CliInstallStepProps {
  environment: string;
  onNext?: () => void;
  onResult?: (result: CliInstallStepResult) => void;
  onCliInstallResultChange?: (result: CliInstallStepResult) => void;
  onInstallStart?: () => void;
  onInstallingChange?: (isInstalling: boolean) => void;
  onOperationActiveChange?: (isActive: boolean) => void;
  onFormActiveChange?: (isActive: boolean) => void;
  isInteractive?: boolean;
  service?: CliInstallService;
}

type ViewState =
  | 'detecting'
  | 'not-required'
  | 'detected'
  | 'confirm'
  | 'installing'
  | 'installed'
  | 'failed';

const DEFAULT_SERVICE: CliInstallService = {
  getInstallCommand: (environment) => CliInstaller.getInstallCommand(environment),
  detectCli: (environment) => CliInstaller.detectCli(environment),
  installCli: (environment) => CliInstaller.installCli(environment),
};

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const CliInstallStep: React.FC<CliInstallStepProps> = ({
  environment,
  onNext,
  onResult,
  onCliInstallResultChange,
  onInstallStart,
  onInstallingChange,
  onOperationActiveChange,
  onFormActiveChange,
  isInteractive = true,
  service = DEFAULT_SERVICE,
}) => {
  const manualCommand = useMemo(
    () => service.getInstallCommand(environment),
    [environment, service],
  );
  const [view, setView] = useState<ViewState>('detecting');
  const [selectedConfirmation, setSelectedConfirmation] = useState<'yes' | 'no'>('yes');
  const [failureMessage, setFailureMessage] = useState<string>();
  const [detectionMessage, setDetectionMessage] = useState<string>();

  const publishResult = useCallback((result: CliInstallStepResult) => {
    onResult?.(result);
    onCliInstallResultChange?.(result);
  }, [onCliInstallResultChange, onResult]);

  useEffect(() => {
    let active = true;
    setView('detecting');
    setFailureMessage(undefined);
    setDetectionMessage(undefined);
    onOperationActiveChange?.(true);

    Promise.resolve()
      .then(() => service.detectCli(environment))
      .then((result) => {
        if (!active) return;
        if (!result.required) {
          const status = 'Este ambiente não requer uma CLI externa.';
          setView('not-required');
          publishResult({ success: true, message: status });
          return;
        }
        if (result.available) {
          const status = '✔ CLI detectada no sistema';
          setView('detected');
          publishResult({ success: true, message: status });
          return;
        }
        if (result.error) setDetectionMessage(result.error.message);
        setView('confirm');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDetectionMessage(toMessage(error));
        setView(manualCommand ? 'confirm' : 'not-required');
      })
      .finally(() => {
        if (active) onOperationActiveChange?.(false);
      });

    return () => {
      active = false;
      onOperationActiveChange?.(false);
    };
  }, [environment, manualCommand, onOperationActiveChange, publishResult, service]);

  const install = useCallback(async () => {
    setView('installing');
    setFailureMessage(undefined);
    onInstallStart?.();
    onInstallingChange?.(true);
    onOperationActiveChange?.(true);

    try {
      const result = await service.installCli(environment);
      if (result.success) {
        const status = `CLI de ${environment} instalada com sucesso.`;
        setView('installed');
        publishResult({ success: true, message: status });
        onNext?.();
        return;
      }

      const message = result.error?.message || 'A instalação da CLI falhou.';
      setFailureMessage(message);
      setView('failed');
      publishResult({ success: false, message });
    } catch (error: unknown) {
      const message = toMessage(error);
      setFailureMessage(message);
      setView('failed');
      publishResult({ success: false, message });
    } finally {
      onInstallingChange?.(false);
      onOperationActiveChange?.(false);
    }
  }, [environment, onInstallStart, onInstallingChange, onNext, onOperationActiveChange, publishResult, service]);

  const isLocalInteraction = view === 'confirm' || view === 'failed';
  useEffect(() => {
    onFormActiveChange?.(isLocalInteraction);
    return () => onFormActiveChange?.(false);
  }, [isLocalInteraction, onFormActiveChange]);

  useInput(
    (input, key) => {
      if (view === 'detecting' || view === 'installing') {
        return;
      }
      const isEnter = key.return || input === '\r' || input === '\n';
      if (view === 'confirm') {
        if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
          setSelectedConfirmation((current) => current === 'yes' ? 'no' : 'yes');
          return;
        }
        if (input.toLowerCase() === 's') setSelectedConfirmation('yes');
        if (input.toLowerCase() === 'n') setSelectedConfirmation('no');
        if (isEnter) {
          if (selectedConfirmation === 'yes') {
            void install();
          } else {
            publishResult({
              success: false,
              message: 'Instalação automática ignorada pelo usuário.',
            });
            onNext?.();
          }
        }
        return;
      }

      if (view === 'failed') {
        if (input.toLowerCase() === 'r') void install();
        if (input.toLowerCase() === 's') onNext?.();
        return;
      }

      if (isEnter && (view === 'detected' || view === 'not-required' || view === 'installed')) {
        onNext?.();
      }
    },
    { isActive: isInteractive },
  );

  return (
    <Box flexDirection="column" width="100%" gap={1}>
      <Box flexDirection="column">
        <Text bold color={theme.colors.primary}>CLI do ambiente</Text>
        <Text color={theme.colors.text}>
          Verificando os requisitos do runner <Text bold color={theme.colors.accent}>{environment}</Text>.
        </Text>
      </Box>

      {view === 'detecting' ? (
        <Spinner label="Verificando a CLI no PATH..." />
      ) : view === 'not-required' ? (
        <Text color={theme.colors.muted}>Este ambiente não requer uma CLI externa.</Text>
      ) : view === 'detected' ? (
        <Text bold color={theme.colors.success}>✔ CLI detectada no sistema</Text>
      ) : view === 'confirm' ? (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.warning} paddingX={1}>
          <Text color={theme.colors.warning}>CLI não encontrada no PATH.</Text>
          {detectionMessage ? <Text color={theme.colors.muted}>Detalhe: {detectionMessage}</Text> : null}
          <Text>Deseja que o CodeForge instale a CLI do ambiente automaticamente?</Text>
          <Box gap={2}>
            <Text bold={selectedConfirmation === 'yes'} color={selectedConfirmation === 'yes' ? theme.colors.primary : theme.colors.muted}>
              {selectedConfirmation === 'yes' ? '› ' : '  '}Sim
            </Text>
            <Text bold={selectedConfirmation === 'no'} color={selectedConfirmation === 'no' ? theme.colors.primary : theme.colors.muted}>
              {selectedConfirmation === 'no' ? '› ' : '  '}Não
            </Text>
          </Box>
          <Text color={theme.colors.muted}>[←/→] Escolher  [Enter] Confirmar</Text>
        </Box>
      ) : view === 'installing' ? (
        <Spinner color={theme.colors.warning} label={`Baixando e instalando a CLI de ${environment}...`} />
      ) : view === 'installed' ? (
        <Text bold color={theme.colors.success}>✔ CLI instalada com sucesso</Text>
      ) : (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.error} paddingX={1}>
          <Text bold color={theme.colors.error}>Falha ao instalar a CLI.</Text>
          {failureMessage ? <Text color={theme.colors.error}>{failureMessage}</Text> : null}
          <Text color={theme.colors.warning}>Instale manualmente com:</Text>
          <Text>{manualCommand}</Text>
          <Text color={theme.colors.muted}>[r] Tentar novamente  [s] Pular e continuar assim mesmo</Text>
        </Box>
      )}

      {(view === 'detected' || view === 'not-required') ? (
        <Text color={theme.colors.muted}>[Enter] Continuar</Text>
      ) : null}
    </Box>
  );
};

export default CliInstallStep;
