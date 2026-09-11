import { useInput } from 'ink';
import {
  PULL_SPEC_PROVIDERS,
  PullSpecFocusedField,
} from './types.js';
import { SpecReference } from '../../../../../domain/spec-source.js';

export interface UsePullSpecKeyboardOptions {
  isOpen: boolean;
  isLoading: boolean;
  activeField: PullSpecFocusedField;
  setActiveField: React.Dispatch<React.SetStateAction<PullSpecFocusedField>>;
  providerIndex: number;
  setProviderIndex: React.Dispatch<React.SetStateAction<number>>;
  items: SpecReference[];
  selectedItemIndex: number;
  setSelectedItemIndex: React.Dispatch<React.SetStateAction<number>>;
  isManualInput: boolean;
  setIsManualInput: React.Dispatch<React.SetStateAction<boolean>>;
  specId: string;
  setSpecId: (val: string) => void;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  handleClose: () => void;
  handleSubmit: () => void;
}

/**
 * Encapsulates keyboard navigation and shortcuts for the PullSpecModal.
 */
export function usePullSpecKeyboard({
  isOpen,
  isLoading,
  activeField,
  setActiveField,
  providerIndex: _providerIndex,
  setProviderIndex,
  items,
  selectedItemIndex,
  setSelectedItemIndex,
  isManualInput,
  setIsManualInput,
  specId,
  setSpecId,
  setErrorMessage,
  handleClose,
  handleSubmit,
}: UsePullSpecKeyboardOptions): void {
  useInput(
    (input, key) => {
      if (isLoading) return;

      // 1. Escape: close modal
      if (key.escape || input === '\u001B') {
        handleClose();
        return;
      }

      // 2. Tab: switch between fields
      if (key.tab) {
        setErrorMessage(null);
        if (key.shift) {
          if (activeField === 'name') setActiveField('id');
          else if (activeField === 'id') setActiveField('provider');
          else setActiveField('name');
        } else {
          if (activeField === 'provider') setActiveField('id');
          else if (activeField === 'id') setActiveField('name');
          else setActiveField('provider');
        }
        return;
      }

      // 3. Enter: advance or submit
      if (key.return || input === '\r' || input === '\n') {
        if (activeField === 'provider') {
          setActiveField('id');
          return;
        }
        if (activeField === 'id') {
          const currentId =
            !isManualInput &&
            items.length > 0 &&
            selectedItemIndex < items.length
              ? items[selectedItemIndex].id
              : specId.trim();

          if (!currentId) {
            setErrorMessage('Spec ID is required.');
            return;
          }
        }
        handleSubmit();
        return;
      }

      // 4. Provider selection navigation
      if (activeField === 'provider') {
        if (key.leftArrow || key.upArrow) {
          setProviderIndex(
            (prev) => (prev - 1 + PULL_SPEC_PROVIDERS.length) % PULL_SPEC_PROVIDERS.length,
          );
          return;
        }
        if (key.rightArrow || key.downArrow || input === ' ') {
          setProviderIndex((prev) => (prev + 1) % PULL_SPEC_PROVIDERS.length);
          return;
        }
      }

      // 5. Spec ID list mode navigation
      if (activeField === 'id' && items.length > 0 && !isManualInput) {
        if (key.upArrow || input === 'k') {
          if (selectedItemIndex > 0) {
            const nextIdx = selectedItemIndex - 1;
            setSelectedItemIndex(nextIdx);
            setSpecId(items[nextIdx].id);
          } else {
            setActiveField('provider');
          }
          return;
        }

        if (key.downArrow || input === 'j') {
          if (selectedItemIndex < items.length - 1) {
            const nextIdx = selectedItemIndex + 1;
            setSelectedItemIndex(nextIdx);
            setSpecId(items[nextIdx].id);
          } else if (selectedItemIndex === items.length - 1) {
            setSelectedItemIndex(items.length);
            setIsManualInput(true);
            setSpecId('');
          } else {
            setActiveField('name');
          }
          return;
        }

        if (input === 'm' || input === 'M') {
          setSelectedItemIndex(items.length);
          setIsManualInput(true);
          setSpecId('');
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
            setSpecId(printable);
            setErrorMessage(null);
          }
        }
        return;
      }

      // 6. Spec ID manual mode navigation between fields
      if (activeField === 'id' && (isManualInput || items.length === 0)) {
        if (key.upArrow) {
          if (items.length > 0 && specId === '') {
            setIsManualInput(false);
            setSelectedItemIndex(items.length - 1);
            setSpecId(items[items.length - 1].id);
          } else {
            setActiveField('provider');
          }
          return;
        }

        if (key.downArrow) {
          setActiveField('name');
          return;
        }
      }

      // 7. Custom Name mode field navigation
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
