import { useInput } from 'ink';
import { PullIntentFocusedField } from './types.js';
import { IntentReference } from '../../../../../domain/intent-source.js';

export interface UsePullIntentKeyboardOptions {
  isOpen: boolean;
  isLoading: boolean;
  activeField: PullIntentFocusedField;
  setActiveField: React.Dispatch<React.SetStateAction<PullIntentFocusedField>>;
  items: IntentReference[];
  selectedItemIndex: number;
  setSelectedItemIndex: React.Dispatch<React.SetStateAction<number>>;
  isManualInput: boolean;
  setIsManualInput: React.Dispatch<React.SetStateAction<boolean>>;
  intentId: string;
  setIntentId: (val: string) => void;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  handleClose: () => void;
  handleSubmit: () => void;
}

/**
 * Encapsulates keyboard navigation and shortcuts for the PullIntentModal.
 * Only 2 focusable fields: 'id' and 'name'.
 */
export function usePullIntentKeyboard({
  isOpen,
  isLoading,
  activeField,
  setActiveField,
  items,
  selectedItemIndex,
  setSelectedItemIndex,
  isManualInput,
  setIsManualInput,
  intentId,
  setIntentId,
  setErrorMessage,
  handleClose,
  handleSubmit,
}: UsePullIntentKeyboardOptions): void {
  useInput(
    (input, key) => {
      if (isLoading) return;

      // 1. Escape: close modal
      if (key.escape || input === '\u001B') {
        handleClose();
        return;
      }

      // 2. Tab: switch between 'id' and 'name' fields only
      if (key.tab) {
        setErrorMessage(null);
        setActiveField((prev) => (prev === 'id' ? 'name' : 'id'));
        return;
      }

      // 3. Enter: submit
      if (key.return || input === '\r' || input === '\n') {
        if (activeField === 'id') {
          const currentId =
            !isManualInput &&
            items.length > 0 &&
            selectedItemIndex < items.length
              ? items[selectedItemIndex].id
              : intentId.trim();

          if (!currentId) {
            setErrorMessage('Intent ID is required.');
            return;
          }
        }
        handleSubmit();
        return;
      }

      // 4. Intent ID list mode navigation
      if (activeField === 'id' && items.length > 0 && !isManualInput) {
        if (key.upArrow || input === 'k') {
          if (selectedItemIndex > 0) {
            const nextIdx = selectedItemIndex - 1;
            setSelectedItemIndex(nextIdx);
            setIntentId(items[nextIdx].id);
          }
          return;
        }

        if (key.downArrow || input === 'j') {
          if (selectedItemIndex < items.length - 1) {
            const nextIdx = selectedItemIndex + 1;
            setSelectedItemIndex(nextIdx);
            setIntentId(items[nextIdx].id);
          } else if (selectedItemIndex === items.length - 1) {
            setSelectedItemIndex(items.length);
            setIsManualInput(true);
            setIntentId('');
          }
          return;
        }

        if (input === 'm' || input === 'M') {
          setSelectedItemIndex(items.length);
          setIsManualInput(true);
          setIntentId('');
          return;
        }

        // Printable char switches directly to manual input
        if (!key.ctrl && !key.meta) {
          const printable = input
            .split('')
            .filter((ch) => {
              const code = ch.charCodeAt(0);
              return (code >= 32 && code !== 127) || code > 127;
            })
            .join('');

          if (printable.length > 0) {
            setSelectedItemIndex(items.length);
            setIsManualInput(true);
            setIntentId(printable);
            setErrorMessage(null);
          }
        }
        return;
      }

      // 5. Intent ID manual mode navigation between fields
      if (activeField === 'id' && (isManualInput || items.length === 0)) {
        if (key.upArrow) {
          if (items.length > 0 && intentId === '') {
            setIsManualInput(false);
            setSelectedItemIndex(items.length - 1);
            setIntentId(items[items.length - 1].id);
          }
          return;
        }

        if (key.downArrow) {
          setActiveField('name');
          return;
        }
      }

      // 6. Custom Name mode field navigation
      if (activeField === 'name') {
        if (key.upArrow) {
          setActiveField('id');
          return;
        }
      }
    },
    { isActive: isOpen },
  );
}
