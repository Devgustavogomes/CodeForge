import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { SupportedLanguage } from '../../../../../config/types.js';
import {
  CliDetectionResult,
  CliInstaller,
} from '../../../../installer/CliInstaller.js';
import { translate } from '../../../../ui/i18n.js';
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
  language?: SupportedLanguage;
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
  language = 'en',
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
          const status = translate('onboarding_cli_not_required', language);
          setView('not-required');
          publishResult({ success: true, message: status });
          return;
        }
        if (result.available) {
          const status = translate('onboarding_cli_detected', language);
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
  }, [environment, language, manualCommand, onOperationActiveChange, publishResult, service]);

  const install = useCallback(async () => {
    setView('installing');
    setFailureMessage(undefined);
    onInstallStart?.();
    onInstallingChange?.(true);
    onOperationActiveChange?.(true);

    try {
      const result = await service.installCli(environment);
      if (result.success) {
        const status = translate('onboarding_cli_installed_status', language, { environment });
        setView('installed');
        publishResult({ success: true, message: status });
        onNext?.();
        return;
      }

      const message = result.error?.message || translate('onboarding_cli_default_failed_message', language);
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
  }, [environment, language, onInstallStart, onInstallingChange, onNext, onOperationActiveChange, publishResult, service]);

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
        if (input.toLowerCase() === 's' || input.toLowerCase() === 'y') setSelectedConfirmation('yes');
        if (input.toLowerCase() === 'n') setSelectedConfirmation('no');
        if (isEnter) {
          if (selectedConfirmation === 'yes') {
            void install();
          } else {
            publishResult({
              success: false,
              message: translate('onboarding_cli_skipped_by_user', language),
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
        <Text bold color={theme.colors.primary}>
          {translate('onboarding_cli_title', language)}
        </Text>
        <Text color={theme.colors.text}>
          {translate('onboarding_cli_description', language, { environment })}
        </Text>
      </Box>

      {view === 'detecting' ? (
        <Spinner label={translate('onboarding_cli_detecting', language)} />
      ) : view === 'not-required' ? (
        <Text color={theme.colors.muted}>
          {translate('onboarding_cli_not_required', language)}
        </Text>
      ) : view === 'detected' ? (
        <Text bold color={theme.colors.success}>
          {translate('onboarding_cli_detected', language)}
        </Text>
      ) : view === 'confirm' ? (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.warning} paddingX={1}>
          <Text color={theme.colors.warning}>
            {translate('onboarding_cli_not_found', language)}
          </Text>
          {detectionMessage ? (
            <Text color={theme.colors.muted}>
              {translate('onboarding_cli_detail', language, { detail: detectionMessage })}
            </Text>
          ) : null}
          <Text>{translate('onboarding_cli_confirm_prompt', language)}</Text>
          <Box gap={2}>
            <Text bold={selectedConfirmation === 'yes'} color={selectedConfirmation === 'yes' ? theme.colors.primary : theme.colors.muted}>
              {selectedConfirmation === 'yes' ? '[>] ' : '    '}{translate('onboarding_cli_confirm_yes', language)}
            </Text>
            <Text bold={selectedConfirmation === 'no'} color={selectedConfirmation === 'no' ? theme.colors.primary : theme.colors.muted}>
              {selectedConfirmation === 'no' ? '[>] ' : '    '}{translate('onboarding_cli_confirm_no', language)}
            </Text>
          </Box>
          <Text color={theme.colors.muted}>
            {translate('onboarding_cli_confirm_nav_hint', language)}
          </Text>
        </Box>
      ) : view === 'installing' ? (
        <Spinner color={theme.colors.warning} label={translate('onboarding_cli_installing', language, { environment })} />
      ) : view === 'installed' ? (
        <Text bold color={theme.colors.success}>
          {translate('onboarding_cli_installed', language)}
        </Text>
      ) : (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.error} paddingX={1}>
          <Text bold color={theme.colors.error}>
            {translate('onboarding_cli_failed', language)}
          </Text>
          {failureMessage ? <Text color={theme.colors.error}>{failureMessage}</Text> : null}
          <Text color={theme.colors.warning}>
            {translate('onboarding_cli_manual_instructions', language)}
          </Text>
          <Text>{manualCommand}</Text>
          <Text color={theme.colors.muted}>
            {translate('onboarding_cli_failed_nav_hint', language)}
          </Text>
        </Box>
      )}

      {(view === 'detected' || view === 'not-required') ? (
        <Text color={theme.colors.muted}>
          {translate('onboarding_cli_continue', language)}
        </Text>
      ) : null}
    </Box>
  );
};

export default CliInstallStep;
