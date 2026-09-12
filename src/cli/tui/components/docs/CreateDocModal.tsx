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
  onSubmit: (docName: string, specName: string) => Promise<void> | void;
  availableSpecs?: string[];
  initialSpec?: string;
  width?: string | number;
  isCreating?: boolean;
  error?: string | null;
  language?: SupportedLanguage;
}

/**
 * Modal form for creating a new document associated with a spec.
 * Uses useTextInput and TextInput primitives for standardized input editing.
 */
export const CreateDocModal: React.FC<CreateDocModalProps> = ({
  isOpen = true,
  onClose,
  onSubmit,
  availableSpecs = [],
  initialSpec,
  width = '100%',
  isCreating = false,
  error: propError,
  language = 'en',
}) => {
  const nav = useNavigation();
  const [docSpec, setDocSpec] = useState(() => initialSpec ?? (availableSpecs[0] || ''));
  const [isSpecCustom, setIsSpecCustom] = useState(false);
  const [activeField, setActiveField] = useState<'name' | 'spec'>('name');
  const [localError, setLocalError] = useState<string | null>(null);
  const displayError = propError ?? localError;

  const handleClose = useCallback(() => {
    nav?.setTextInputActive?.(false);
    onClose();
  }, [nav, onClose]);

  const handleCycleSpec = useCallback(
    (direction: 1 | -1 = 1) => {
      if (availableSpecs.length === 0) return;
      setIsSpecCustom(false);
      const currentIdx = availableSpecs.indexOf(docSpec);
      const nextIdx =
        currentIdx === -1
          ? 0
          : (currentIdx + direction + availableSpecs.length) % availableSpecs.length;
      setDocSpec(availableSpecs[nextIdx]);
      setLocalError(null);
    },
    [availableSpecs, docSpec]
  );

  const handleSubmit = useCallback(async (nameVal?: string, specVal?: string) => {
    const trimmedName = (nameVal ?? nameInput.value).trim().replace(/\.md$/i, '');
    const trimmedSpec = (specVal ?? (isSpecCustom || availableSpecs.length === 0 ? specInput.value : docSpec))
      .trim()
      .replace(/\.md$/i, '');

    if (!trimmedName) {
      setLocalError(translate('tui_docs_create_err_name_required', language));
      setActiveField('name');
      return;
    }
    if (!trimmedSpec) {
      setLocalError(translate('tui_docs_create_err_spec_required', language));
      setActiveField('spec');
      return;
    }

    setLocalError(null);
    try {
      await onSubmit(trimmedName, trimmedSpec);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
    }
  }, [availableSpecs, docSpec, isSpecCustom, onSubmit]);

  const nameInput = useTextInput({
    initialValue: '',
    isActive: isOpen && activeField === 'name',
    syncNavigation: activeField === 'name',
    onChange: () => setLocalError(null),
    onSubmit: (val) => {
      const effectiveSpec = isSpecCustom || availableSpecs.length === 0 ? specInput.value : docSpec;
      if (val.trim() && !effectiveSpec.trim()) {
        setActiveField('spec');
      } else {
        void handleSubmit(val);
      }
    },
    onCancel: handleClose,
  });

  const specInput = useTextInput({
    initialValue: docSpec,
    isActive: isOpen && activeField === 'spec' && (isSpecCustom || availableSpecs.length === 0),
    syncNavigation: activeField === 'spec',
    onChange: (val) => {
      setDocSpec(val);
      setLocalError(null);
      if (!val && availableSpecs.length > 0) {
        setIsSpecCustom(false);
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
      const defaultSpec = initialSpec ?? (availableSpecs[0] || '');
      setDocSpec(defaultSpec);
      specInput.setValue(defaultSpec);
      setIsSpecCustom(false);
      setActiveField('name');
      setLocalError(null);
    }
  }, [isOpen, initialSpec, availableSpecs]);

  useInput(
    (input, key) => {
      if (!isOpen) return;

      if (key.escape || input === '\u001B') {
        handleClose();
        return;
      }

      if (key.tab) {
        setActiveField((prev) => (prev === 'name' ? 'spec' : 'name'));
        return;
      }

      if (key.upArrow) {
        setActiveField('name');
        return;
      }

      if (key.downArrow) {
        setActiveField('spec');
        return;
      }

      // Spec selection mode when available specs exist and not custom input
      if (activeField === 'spec' && availableSpecs.length > 0 && !isSpecCustom) {
        if (key.return || input === '\r' || input === '\n') {
          void handleSubmit();
          return;
        }

        if (key.leftArrow) {
          handleCycleSpec(-1);
          return;
        }

        if (key.rightArrow || input === ' ') {
          handleCycleSpec(1);
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
            setIsSpecCustom(true);
            setDocSpec(printable);
            specInput.setValue(printable);
            setLocalError(null);
          }
        }
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen) return null;

  const docName = nameInput.value;
  const effectiveSpec = isSpecCustom || availableSpecs.length === 0 ? specInput.value : docSpec;

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
            <Text bold color={activeField === 'spec' ? theme.colors.primary : theme.colors.text}>{translate('tui_docs_create_spec_label', language)}</Text>
            {availableSpecs.length > 0 && !isSpecCustom ? (
              <Box gap={1}>
                {availableSpecs.map((sp) => {
                  const isSelected = docSpec === sp;
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
                  value={effectiveSpec}
                  placeholder={translate('tui_docs_create_spec_placeholder', language)}
                  isFocused={activeField === 'spec'}
                  cursorColor={theme.colors.primary}
                />
              </Box>
            )}
          </Box>
          {activeField === 'spec' && availableSpecs.length > 0 && !isSpecCustom && (
            <Text color={theme.colors.muted}>{translate('tui_docs_create_spec_hint', language)}</Text>
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
