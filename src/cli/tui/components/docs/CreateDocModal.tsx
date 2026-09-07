import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../common/Modal.js';
import { useNavigation } from '../../context/NavigationContext.js';

export interface CreateDocModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSubmit: (docName: string, specName: string) => Promise<void> | void;
  availableSpecs?: string[];
  initialSpec?: string;
  width?: string | number;
  isCreating?: boolean;
  error?: string | null;
}

export const CreateDocModal: React.FC<CreateDocModalProps> = ({
  isOpen = true,
  onClose,
  onSubmit,
  availableSpecs = [],
  initialSpec,
  width = '100%',
  isCreating = false,
  error: propError,
}) => {
  const nav = useNavigation();
  const setTextInputActive = nav.setTextInputActive;
  const [docName, setDocName] = useState('');
  const [docSpec, setDocSpec] = useState(() => initialSpec ?? (availableSpecs[0] || ''));
  const [isSpecCustom, setIsSpecCustom] = useState(false);
  const [activeField, setActiveField] = useState<'name' | 'spec'>('name');
  const [localError, setLocalError] = useState<string | null>(null);
  const displayError = propError ?? localError;

  useEffect(() => {
    if (isOpen) {
      setDocName('');
      setDocSpec(initialSpec ?? (availableSpecs[0] || ''));
      setIsSpecCustom(false);
      setActiveField('name');
      setLocalError(null);
      setTextInputActive?.(true);
    } else {
      setTextInputActive?.(false);
    }
    return () => {
      setTextInputActive?.(false);
    };
  }, [isOpen, initialSpec, availableSpecs, setTextInputActive]);

  const handleClose = useCallback(() => {
    setTextInputActive?.(false);
    onClose();
  }, [onClose, setTextInputActive]);

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

  const handleSubmit = useCallback(async () => {
    const trimmedName = docName.trim().replace(/\.md$/i, '');
    const trimmedSpec = docSpec.trim().replace(/\.md$/i, '');

    if (!trimmedName) {
      setLocalError('Documentation name is required.');
      setActiveField('name');
      return;
    }
    if (!trimmedSpec) {
      setLocalError('Associated specification name is required.');
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
  }, [docName, docSpec, onSubmit]);

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
      if (key.return || input === '\r' || input === '\n') {
        if (activeField === 'name' && docName.trim() && !docSpec.trim()) {
          setActiveField('spec');
          return;
        }
        void handleSubmit();
        return;
      }

      if (activeField === 'spec' && availableSpecs.length > 0 && !isSpecCustom) {
        if (key.leftArrow || key.upArrow) {
          handleCycleSpec(-1);
          return;
        }
        if (key.rightArrow || key.downArrow || input === ' ') {
          handleCycleSpec(1);
          return;
        }
      }

      if (key.upArrow) {
        setActiveField('name');
        return;
      }
      if (key.downArrow) {
        setActiveField('spec');
        return;
      }

      if (key.backspace || key.delete || input === '\x08' || input === '\x7f') {
        if (activeField === 'name') {
          setDocName((prev) => prev.slice(0, -1));
        } else {
          setDocSpec((prev) => {
            const next = prev.slice(0, -1);
            if (!next) setIsSpecCustom(false);
            return next;
          });
        }
        setLocalError(null);
        return;
      }

      if (key.ctrl && input === 'u') {
        if (activeField === 'name') setDocName('');
        else {
          setDocSpec('');
          setIsSpecCustom(false);
        }
        setLocalError(null);
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

        if (printable.length > 0) {
          if (activeField === 'name') {
            setDocName((prev) => prev + printable);
          } else if (printable !== ' ' || isSpecCustom || availableSpecs.length === 0) {
            if (!isSpecCustom && availableSpecs.includes(docSpec)) {
              setDocSpec(printable);
              setIsSpecCustom(true);
            } else {
              setDocSpec((prev) => prev + printable);
            }
          }
          setLocalError(null);
        }
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen) return null;

  return (
    <Modal title="Create Documentation" isOpen={true} onClose={handleClose} borderColor="cyan" width={width}>
      <Box flexDirection="column" width="100%">
        <Box justifyContent="space-between" width="100%" marginBottom={0}>
          <Box gap={1} flexShrink={1}>
            <Text bold color={activeField === 'name' ? 'cyan' : 'white'}>1. Document Name (slug):</Text>
            <Text color="cyan" bold>{'> '}</Text>
            {docName.length > 0 ? (
              <Text color="white" bold wrap="truncate-end">{docName}{activeField === 'name' ? '█' : ''}</Text>
            ) : (
              <Box gap={1}>
                {activeField === 'name' && <Text color="cyan">█</Text>}
                <Text dimColor wrap="truncate-end">e.g. architecture, system-design, api-reference</Text>
              </Box>
            )}
          </Box>
        </Box>

        <Box justifyContent="space-between" width="100%" marginBottom={0}>
          <Box gap={1} flexShrink={1}>
            <Text bold color={activeField === 'spec' ? 'cyan' : 'white'}>2. Associated Spec:</Text>
            {availableSpecs.length > 0 && !isSpecCustom ? (
              <Box gap={1}>
                {availableSpecs.map((sp) => {
                  const isSelected = docSpec === sp;
                  return (
                    <Text key={sp} color={isSelected ? 'cyan' : 'gray'} bold={isSelected}>
                      {isSelected ? `● [${sp}]` : `○ ${sp}`}
                    </Text>
                  );
                })}
              </Box>
            ) : (
              <Box gap={1}>
                <Text color="cyan" bold>{'> '}</Text>
                {docSpec.length > 0 ? (
                  <Text color="white" wrap="truncate-end">{docSpec}{activeField === 'spec' ? '█' : ''}</Text>
                ) : (
                  <Box gap={1}>
                    {activeField === 'spec' && <Text color="cyan">█</Text>}
                    <Text dimColor wrap="truncate-end">e.g. tui, decouple-spec-source</Text>
                  </Box>
                )}
              </Box>
            )}
          </Box>
          {activeField === 'spec' && availableSpecs.length > 0 && !isSpecCustom && (
            <Text dimColor>[Space/←/→] Select spec</Text>
          )}
        </Box>

        {displayError && (
          <Box marginBottom={0}>
            <Text color="red" bold wrap="truncate-end">✗ {displayError}</Text>
          </Box>
        )}
        {isCreating && (
          <Box marginBottom={0}>
            <Text color="yellow">⏳ Generating documentation with agent runner...</Text>
          </Box>
        )}

        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between" width="100%">
          <Text dimColor>[Tab] Switch field · [Enter] Generate Doc</Text>
          <Text bold color="red">[Esc] Cancel / Voltar</Text>
        </Box>
      </Box>
    </Modal>
  );
};

export default CreateDocModal;
