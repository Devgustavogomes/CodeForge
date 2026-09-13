import React, { useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { SupportedLanguage } from '../../../../../config/types.js';
import { HookMap } from '../../../../../domain/hook.js';
import { translate } from '../../../../ui/i18n.js';
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
  language?: SupportedLanguage;
}

/**
 * Optional lifecycle hooks configuration during onboarding.
 *
 * Reuses the same state machine and components from the Config tab,
 * but operates in a controlled manner: changes remain only in the wizard state
 * until the final onboarding confirmation.
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
  language = 'en',
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
    // At the main level, Enter belongs to the wizard; the right arrow opens the event.
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
            {translate('onboarding_hooks_title', language)}
          </Text>
          <Text color={hookCount > 0 ? theme.colors.accent : theme.colors.muted} bold>
            {translate('onboarding_hooks_count', language, {
              count: hookCount,
              plural: hookCount === 1 ? '' : 's',
            })}
          </Text>
        </Box>

        <Text color={theme.colors.text}>
          {translate('onboarding_hooks_description', language)}
        </Text>
        <Box gap={2}>
          <Text color={theme.colors.warning} bold>
            {translate('onboarding_hooks_gate_badge', language)}
          </Text>
          <Text color={theme.colors.muted}>
            {translate('onboarding_hooks_gate_desc', language)}
          </Text>
          <Text color={theme.colors.success} bold>
            {translate('onboarding_hooks_notify_badge', language)}
          </Text>
          <Text color={theme.colors.muted}>
            {translate('onboarding_hooks_notify_desc', language)}
          </Text>
        </Box>
        <Text color={theme.colors.muted}>
          {translate('onboarding_hooks_skip_note', language)}
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
