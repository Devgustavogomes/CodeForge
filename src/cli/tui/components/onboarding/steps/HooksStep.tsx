import React, { useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { HookMap } from '../../../../../domain/hook.js';
import { theme } from '../../../theme.js';
import { HooksEventList } from '../../config/components/HooksEventList.js';
import { HooksCommandList } from '../../config/components/HooksCommandList.js';
import { HookForm } from '../../config/components/HookForm.js';
import { useConfigureHooksModal } from '../../config/hooks/useConfigureHooksModal.js';

export interface HooksStepProps {
  hooks: HookMap;
  onUpdateHooks?: (hooks: HookMap) => void;
  onHooksChange?: (hooks: HookMap) => void;
  onChange?: (hooks: HookMap) => void;
  onContinue?: () => void;
  onNext?: () => void;
  onBack?: () => void;
  onFormActiveChange?: (isActive: boolean) => void;
  isActive?: boolean;
  isInteractive?: boolean;
}

/**
 * Configuração opcional de hooks durante o onboarding.
 *
 * Reutiliza a mesma máquina de estados e os mesmos componentes da aba Config,
 * mas opera de forma controlada: as mudanças ficam somente no estado do wizard
 * até a confirmação final do onboarding.
 */
export const HooksStep: React.FC<HooksStepProps> = ({
  hooks,
  onUpdateHooks,
  onHooksChange,
  onChange,
  onContinue,
  onNext,
  onBack,
  onFormActiveChange,
  isActive = true,
  isInteractive,
}) => {
  const interactive = isInteractive ?? isActive;
  const updateHooks = onHooksChange ?? onUpdateHooks ?? onChange;
  const continueToSummary = onNext ?? onContinue;

  useEffect(() => {
    onFormActiveChange?.(interactive);
    return () => onFormActiveChange?.(false);
  }, [interactive, onFormActiveChange]);
  const hookCount = useMemo(
    () => Object.values(hooks).reduce(
      (total, definitions) => total + (definitions?.length ?? 0),
      0,
    ),
    [hooks],
  );

  const configuration = useConfigureHooksModal({
    isOpen: interactive,
    onClose: onBack,
    hooks,
    onUpdateHooks: updateHooks,
    persistenceMode: 'controlled',
    // No nível principal, Enter pertence ao wizard; a seta direita abre o evento.
    selectEventOnEnter: false,
  });

  useInput(
    (input, key) => {
      if (configuration.view !== 'events') return;

      const isEnter = key.return || input === '\r' || input === '\n';
      if (isEnter || input.toLowerCase() === 'c') {
        continueToSummary?.();
      }
    },
    { isActive: interactive && configuration.view === 'events' },
  );

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
        marginBottom={1}
      >
        <Box justifyContent="space-between">
          <Text bold color={theme.colors.primary}>
            Hooks de ciclo de vida (opcional)
          </Text>
          <Text color={hookCount > 0 ? theme.colors.accent : theme.colors.muted} bold>
            {hookCount} hook{hookCount === 1 ? '' : 's'} configurado{hookCount === 1 ? '' : 's'}
          </Text>
        </Box>

        <Text color={theme.colors.text}>
          Hooks são scripts locais executados em momentos-chave, como task.started,
          task.completed e run.completed.
        </Text>
        <Box gap={2}>
          <Text color={theme.colors.warning} bold>[GATE]</Text>
          <Text color={theme.colors.muted}>
            pode interromper o fluxo quando o comando falha.
          </Text>
          <Text color={theme.colors.success} bold>[NOTIFY]</Text>
          <Text color={theme.colors.muted}>
            apenas registra e avisa, sem interromper.
          </Text>
        </Box>
        <Text color={theme.colors.muted}>
          Você pode continuar sem cadastrar nenhum hook e configurá-los depois na aba Config.
        </Text>
      </Box>

      {configuration.view === 'events' && (
        <HooksEventList
          hooks={configuration.hooks}
          selectedIndex={configuration.selectedEventIndex}
          showContinueAction
        />
      )}

      {configuration.view === 'commands' && (
        <HooksCommandList
          event={configuration.selectedEvent}
          commands={configuration.commands}
          selectedIndex={configuration.selectedCommandIndex}
          deleteConfirmIndex={configuration.deleteConfirmIndex}
          isDeleting={configuration.deleteConfirmIndex !== null}
        />
      )}

      {configuration.view === 'form' && (
        <HookForm
          event={configuration.selectedEvent}
          activeField={configuration.activeFormField}
          activeFieldIndex={configuration.activeFormFieldIndex}
          run={configuration.run}
          type={configuration.type}
          name={configuration.name}
          isEditing={configuration.isEditing}
          errorMessage={configuration.formErrorMessage}
          onChangeRun={configuration.setRun}
          onChangeType={configuration.setType}
          onChangeName={configuration.setName}
          onSubmit={configuration.saveHook}
          onCancel={configuration.handleEsc}
        />
      )}

      {configuration.feedbackMessage && (
        <Box marginTop={1} paddingX={1}>
          <Text color={theme.colors.success} bold>
            {configuration.feedbackMessage}
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default HooksStep;
