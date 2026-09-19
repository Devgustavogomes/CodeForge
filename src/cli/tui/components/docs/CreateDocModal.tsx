import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../common/Modal.js';
import { TextInput } from '../common/TextInput.js';
import { useTextInput } from '../../hooks/useTextInput.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { translate } from '../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../config/types.js';
import { theme } from '../../theme.js';

export interface CreateDocModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSubmit: (docName: string, intentName: string) => Promise<void> | void;
  availableIntents?: string[];
  initialIntent?: string;
  width?: string | number;
  isCreating?: boolean;
  error?: string | null;
  language?: SupportedLanguage;
}

/**
 * Modal form for creating a new document associated with a intent.
 * Uses useTextInput and TextInput primitives for standardized input editing.
 */
export const CreateDocModal: React.FC<CreateDocModalProps> = ({
  isOpen = true,
  onClose,
  onSubmit,
  availableIntents = [],
  initialIntent,
  width = '100%',
  isCreating = false,
  error: propError,
  language = 'en',
}) => {
  const nav = useNavigation();
  const [docIntent, setDocIntent] = useState(() => initialIntent ?? (availableIntents[0] || ''));
  const [isIntentCustom, setIsIntentCustom] = useState(false);
  const [activeField, setActiveField] = useState<'name' | 'intent'>('name');
  const [localError, setLocalError] = useState<string | null>(null);
  const displayError = propError ?? localError;

  const handleClose = useCallback(() => {
    nav?.setTextInputActive?.(false);
    onClose();
  }, [nav, onClose]);

  const handleCycleIntent = useCallback(
    (direction: 1 | -1 = 1) => {
      if (availableIntents.length === 0) return;
      setIsIntentCustom(false);
      const currentIdx = availableIntents.indexOf(docIntent);
      const nextIdx =
        currentIdx === -1
          ? 0
          : (currentIdx + direction + availableIntents.length) % availableIntents.length;
      setDocIntent(availableIntents[nextIdx]);
      setLocalError(null);
    },
    [availableIntents, docIntent]
  );

  const handleSubmit = useCallback(async (nameVal?: string, intentVal?: string) => {
    const trimmedName = (nameVal ?? nameInput.value).trim().replace(/\.md$/i, '');
    const trimmedIntent = (intentVal ?? (isIntentCustom || availableIntents.length === 0 ? intentInput.value : docIntent))
      .trim()
      .replace(/\.md$/i, '');

    if (!trimmedName) {
      setLocalError(translate('tui_docs_create_err_name_required', language));
      setActiveField('name');
      return;
    }
    if (!trimmedIntent) {
      setLocalError(translate('tui_docs_create_err_intent_required', language));
      setActiveField('intent');
      return;
    }

    setLocalError(null);
    try {
      await onSubmit(trimmedName, trimmedIntent);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
    }
  }, [availableIntents, docIntent, isIntentCustom, onSubmit]);

  const nameInput = useTextInput({
    initialValue: '',
    isActive: isOpen && activeField === 'name',
    syncNavigation: activeField === 'name',
    onChange: () => setLocalError(null),
    onSubmit: (val) => {
      const effectiveIntent = isIntentCustom || availableIntents.length === 0 ? intentInput.value : docIntent;
      if (val.trim() && !effectiveIntent.trim()) {
        setActiveField('intent');
      } else {
        void handleSubmit(val);
      }
    },
    onCancel: handleClose,
  });

  const intentInput = useTextInput({
    initialValue: docIntent,
    isActive: isOpen && activeField === 'intent' && (isIntentCustom || availableIntents.length === 0),
    syncNavigation: activeField === 'intent',
    onChange: (val) => {
      setDocIntent(val);
      setLocalError(null);
      if (!val && availableIntents.length > 0) {
        setIsIntentCustom(false);
      }
    },
    onSubmit: (val) => {
      void handleSubmit(nameInput.value, val);
    },
    onCancel: handleClose,
  });

  useEffect(() => {
    if (isOpen) {
      nameInput.setValue('');
      const defaultIntent = initialIntent ?? (availableIntents[0] || '');
      setDocIntent(defaultIntent);
      intentInput.setValue(defaultIntent);
      setIsIntentCustom(false);
      setActiveField('name');
      setLocalError(null);
    }
  }, [isOpen, initialIntent, availableIntents]);

  useInput(
    (input, key) => {
      if (!isOpen) return;

      if (key.escape || input === '\u001B') {
        handleClose();
        return;
      }

      if (key.tab) {
        setActiveField((prev) => (prev === 'name' ? 'intent' : 'name'));
        return;
      }

      if (key.upArrow) {
        setActiveField('name');
        return;
      }

      if (key.downArrow) {
        setActiveField('intent');
        return;
      }

      // Intent selection mode when available intents exist and not custom input
      if (activeField === 'intent' && availableIntents.length > 0 && !isIntentCustom) {
        if (key.return || input === '\r' || input === '\n') {
          void handleSubmit();
          return;
        }

        if (key.leftArrow) {
          handleCycleIntent(-1);
          return;
        }

        if (key.rightArrow || input === ' ') {
          handleCycleIntent(1);
          return;
        }

        if (!key.ctrl && !key.meta) {
          const printable = input
            .split('')
            .filter((ch) => {
              const code = ch.charCodeAt(0);
              return (code >= 32 && code !== 127) || code > 127;
            })
            .join('');

          if (printable.length > 0 && printable !== ' ') {
            setIsIntentCustom(true);
            setDocIntent(printable);
            intentInput.setValue(printable);
            setLocalError(null);
          }
        }
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen) return null;

  const docName = nameInput.value;
  const effectiveIntent = isIntentCustom || availableIntents.length === 0 ? intentInput.value : docIntent;

  return (
    <Modal title={translate('tui_modal_create_doc', language)} isOpen={true} onClose={handleClose} borderColor={theme.colors.primary} width={width}>
      <Box flexDirection="column" width="100%">
        <Box justifyContent="space-between" width="100%" marginBottom={0}>
          <Box gap={1} flexShrink={1}>
            <Text bold color={activeField === 'name' ? theme.colors.primary : theme.colors.text}>{translate('tui_docs_create_name_label', language)}</Text>
            <Text color={theme.colors.primary} bold>{'> '}</Text>
            <TextInput
              value={docName}
              placeholder={translate('tui_docs_create_name_placeholder', language)}
              isFocused={activeField === 'name'}
              cursorColor={theme.colors.primary}
            />
          </Box>
        </Box>

        <Box justifyContent="space-between" width="100%" marginBottom={0}>
          <Box gap={1} flexShrink={1}>
            <Text bold color={activeField === 'intent' ? theme.colors.primary : theme.colors.text}>{translate('tui_docs_create_intent_label', language)}</Text>
            {availableIntents.length > 0 && !isIntentCustom ? (
              <Box gap={1}>
                {availableIntents.map((sp) => {
                  const isSelected = docIntent === sp;
                  return (
                    <Text key={sp} color={isSelected ? theme.colors.primary : theme.colors.muted} bold={isSelected}>
                      {isSelected ? `● [${sp}]` : `○ ${sp}`}
                    </Text>
                  );
                })}
              </Box>
            ) : (
              <Box gap={1}>
                <Text color={theme.colors.primary} bold>{'> '}</Text>
                <TextInput
                  value={effectiveIntent}
                  placeholder={translate('tui_docs_create_intent_placeholder', language)}
                  isFocused={activeField === 'intent'}
                  cursorColor={theme.colors.primary}
                />
              </Box>
            )}
          </Box>
          {activeField === 'intent' && availableIntents.length > 0 && !isIntentCustom && (
            <Text color={theme.colors.muted}>{translate('tui_docs_create_intent_hint', language)}</Text>
          )}
        </Box>

        {displayError && (
          <Box marginBottom={0}>
            <Text color={theme.colors.error} bold wrap="truncate-end">✗ {displayError}</Text>
          </Box>
        )}
        {isCreating && (
          <Box marginBottom={0}>
            <Text color={theme.colors.warning}>{translate('tui_docs_create_generating_notice', language)}</Text>
          </Box>
        )}

        <Box marginTop={1} borderStyle="single" borderColor={theme.colors.borderSubtle} paddingX={1} justifyContent="space-between" width="100%">
          <Text color={theme.colors.muted}>{translate('tui_docs_create_shortcuts', language)}</Text>
          <Text bold color={theme.colors.error}>{translate('tui_docs_create_cancel_hint', language)}</Text>
        </Box>
      </Box>
    </Modal>
  );
};

export default CreateDocModal;
