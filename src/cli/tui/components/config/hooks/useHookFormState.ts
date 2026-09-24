import { useState, useCallback, useRef } from 'react';
import { useInput } from 'ink';
import {
  HookEvent,
  HookType,
  HookDefinition,
} from '../../../../../domain/hook.js';
import {
  HookFormField,
  HOOK_FORM_FIELDS,
} from '../components/HookForm.js';
import { useTextInput } from '../../../hooks/useTextInput.js';

/**
 * Deriva um identificador (name) amigável e limpo para o hook caso omitido.
 * Utiliza o primeiro termo do comando executável ou um fallback baseado no evento e timestamp.
 */
export function deriveHookName(run: string, event: HookEvent): string {
  const trimmed = run.trim();
  if (!trimmed) {
    return `${event}-hook-${Date.now()}`;
  }
  const firstTerm = trimmed
    .split(/\s+/)[0]
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '');

  if (firstTerm.length > 0) {
    return firstTerm;
  }
  return `${event}-hook-${Date.now()}`;
}

export interface UseHookFormStateOptions {
  isActive: boolean;
  onSave: () => void;
}

export interface UseHookFormStateReturn {
  run: string;
  setRun: (val: string | ((prev: string) => string)) => void;
  type: HookType;
  setType: React.Dispatch<React.SetStateAction<HookType>>;
  name: string;
  setName: (val: string | ((prev: string) => string)) => void;
  activeFormFieldIndex: number;
  setActiveFormFieldIndex: React.Dispatch<React.SetStateAction<number>>;
  activeFormField: HookFormField;
  formErrorMessage: string | null;
  setFormErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  editingCommandIndex: number | null;
  setEditingCommandIndex: React.Dispatch<React.SetStateAction<number | null>>;
  isEditing: boolean;
  initAddForm: () => void;
  initEditForm: (index: number, cmd: HookDefinition) => void;
  buildHookDefinition: (event: HookEvent) => HookDefinition | null;
}

/**
 * Sub-hook for Nível 3 (Form View) in ConfigureHooksModal.
 * Manages run, type, and name inputs with validation and auto-name derivation.
 */
export function useHookFormState({
  isActive,
  onSave,
}: UseHookFormStateOptions): UseHookFormStateReturn {
  const [type, setType] = useState<HookType>('notify');
  const [activeFormFieldIndex, setActiveFormFieldIndex] = useState<number>(0);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);
  const [editingCommandIndex, setEditingCommandIndex] = useState<number | null>(null);

  const activeFormField: HookFormField =
    HOOK_FORM_FIELDS[activeFormFieldIndex] ?? 'run';

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const runInput = useTextInput({
    initialValue: '',
    isActive: isActive && activeFormField === 'run',
    syncNavigation: false,
    onChange: () => setFormErrorMessage(null),
  });

  const nameInput = useTextInput({
    initialValue: '',
    isActive: isActive && activeFormField === 'name',
    syncNavigation: false,
  });

  const run = runInput.value;
  const name = nameInput.value;
  const isEditing = editingCommandIndex !== null;

  const initAddForm = useCallback(() => {
    setEditingCommandIndex(null);
    runInput.setValue('');
    nameInput.setValue('');
    setType('notify');
    setActiveFormFieldIndex(0);
    setFormErrorMessage(null);
  }, [runInput, nameInput]);

  const initEditForm = useCallback(
    (index: number, cmd: HookDefinition) => {
      setEditingCommandIndex(index);
      runInput.setValue(cmd.run || '');
      nameInput.setValue(cmd.name || '');
      setType(cmd.type || 'notify');
      setActiveFormFieldIndex(0);
      setFormErrorMessage(null);
    },
    [runInput, nameInput]
  );

  const buildHookDefinition = useCallback(
    (event: HookEvent): HookDefinition | null => {
      const trimmedRun = run.trim();
      if (!trimmedRun) {
        setFormErrorMessage('O comando (run) é obrigatório.');
        return null;
      }

      const hookName = name.trim()
        ? name.trim()
        : deriveHookName(trimmedRun, event);

      return {
        name: hookName,
        run: trimmedRun,
        type,
      };
    },
    [run, name, type]
  );

  useInput(
    (input, key) => {
      if (!isActive) return;

      const isTab = (key.tab && !key.shift) || input === '\t';
      const isShiftTab = (key.tab && key.shift) || input === '\x1b[Z';

      if (isShiftTab || key.upArrow) {
        setActiveFormFieldIndex((prev) => (prev - 1 + 4) % 4);
        return;
      }

      if (isTab || key.downArrow) {
        setActiveFormFieldIndex((prev) => (prev + 1) % 4);
        return;
      }

      if (key.return || input === '\r' || input === '\n') {
        onSaveRef.current();
        return;
      }

      if (activeFormField === 'type') {
        if (input === ' ' || key.leftArrow || key.rightArrow) {
          setType((prev) => (prev === 'gate' ? 'notify' : 'gate'));
          return;
        }
      }

      if (activeFormField === 'save') {
        if (input === ' ') {
          onSaveRef.current();
          return;
        }
      }
    },
    { isActive }
  );

  return {
    run,
    setRun: runInput.setValue,
    type,
    setType,
    name,
    setName: nameInput.setValue,
    activeFormFieldIndex,
    setActiveFormFieldIndex,
    activeFormField,
    formErrorMessage,
    setFormErrorMessage,
    editingCommandIndex,
    setEditingCommandIndex,
    isEditing,
    initAddForm,
    initEditForm,
    buildHookDefinition,
  };
}
