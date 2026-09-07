import { useContext } from 'react';
import { useInput } from 'ink';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { ConfigFieldKey, FIELD_ORDER } from '../components/ConfigField.js';

export interface UseConfigHotkeysProps {
  isInteractive?: boolean;
  isEditing: boolean;
  activeField: ConfigFieldKey;
  setEditValue: React.Dispatch<React.SetStateAction<string>>;
  setFocusedFieldIndex: React.Dispatch<React.SetStateAction<number>>;
  onSave: () => void;
  onCycleLanguage: (dir: 1 | -1) => void;
  onCycleEnvironment: (dir: 1 | -1) => void;
  onCyclePlannerAgent: (dir: 1 | -1) => void;
  onCycleExecutorAgent: (dir: 1 | -1) => void;
  onStartEditing: () => void;
  onStartCustomEdit: () => void;
  onCommitEditing: () => void;
  onCancelEditing: () => void;
  onClearFeedback?: () => void;
}

export function useConfigHotkeys({
  isInteractive = true,
  isEditing,
  activeField,
  setEditValue,
  setFocusedFieldIndex,
  onSave,
  onCycleLanguage,
  onCycleEnvironment,
  onCyclePlannerAgent,
  onCycleExecutorAgent,
  onStartEditing,
  onStartCustomEdit,
  onCommitEditing,
  onCancelEditing,
  onClearFeedback,
}: UseConfigHotkeysProps) {
  const nav = useContext(NavigationContext);

  useInput(
    (input, key) => {
      if (!isInteractive) return;

      // When actively editing a text field
      if (isEditing) {
        if (key.escape) {
          onCancelEditing();
          return;
        }
        if (key.return || input === '\r' || input === '\n') {
          onCommitEditing();
          return;
        }
        if (
          key.backspace ||
          key.delete ||
          input === '\x08' ||
          input === '\x7f'
        ) {
          setEditValue((prev) => prev.slice(0, -1));
          return;
        }
        if (key.ctrl && input === 'u') {
          setEditValue('');
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
            setEditValue((prev) => prev + printable);
          }
        }
        return;
      }

      if (nav?.isTextInputActive) return;

      // Navigate form fields: Up/Down or k/j
      if (key.upArrow || input === 'k') {
        setFocusedFieldIndex((prev) =>
          prev > 0 ? prev - 1 : FIELD_ORDER.length - 1,
        );
        onClearFeedback?.();
        return;
      }
      if (key.downArrow || input === 'j' || key.tab) {
        setFocusedFieldIndex((prev) =>
          prev < FIELD_ORDER.length - 1 ? prev + 1 : 0,
        );
        onClearFeedback?.();
        return;
      }

      // Quick cycle with Space or Left/Right
      if (activeField === 'language') {
        if (key.leftArrow) {
          onCycleLanguage(-1);
          return;
        }
        if (key.rightArrow || input === ' ') {
          onCycleLanguage(1);
          return;
        }
      }

      if (activeField === 'environment') {
        if (key.leftArrow) {
          onCycleEnvironment(-1);
          return;
        }
        if (key.rightArrow || input === ' ') {
          onCycleEnvironment(1);
          return;
        }
      }

      if (activeField === 'plannerAgent') {
        if (key.leftArrow) {
          onCyclePlannerAgent(-1);
          return;
        }
        if (key.rightArrow || input === ' ') {
          onCyclePlannerAgent(1);
          return;
        }
        if (input === 'e') {
          onStartCustomEdit();
          return;
        }
      }

      if (activeField === 'executorAgent') {
        if (key.leftArrow) {
          onCycleExecutorAgent(-1);
          return;
        }
        if (key.rightArrow || input === ' ') {
          onCycleExecutorAgent(1);
          return;
        }
        if (input === 'e') {
          onStartCustomEdit();
          return;
        }
      }

      // 's' or 'S' -> Save config
      if (input === 's' || input === 'S') {
        onSave();
        return;
      }

      // Enter -> Cycle or edit
      if (key.return || input === '\r' || input === '\n') {
        onStartEditing();
        return;
      }
    },
    { isActive: isInteractive },
  );
}
