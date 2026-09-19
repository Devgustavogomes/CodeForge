import { useInput } from 'ink';
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
  onOpenHooksModal?: () => void;
  onOpenIntentSourceModal?: () => void;}

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
  onOpenHooksModal,
  onOpenIntentSourceModal,
  }: UseConfigHotkeysProps) {
  const handleOpenSourceModal = onOpenIntentSourceModal;

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
        if (key.backspace || key.delete) {
          setEditValue((prev) => prev.slice(0, -1));
          return;
        }
        if (input && input.length === 1) {
          setEditValue((prev) => prev + input);
          return;
        }
        return;
      }

      // Clear transient feedback upon any navigation action
      onClearFeedback?.();

      // Navigation: Up/Down arrow or Tab/Shift-Tab or k/j
      if (key.upArrow || (key.tab && key.shift) || input === '\x1b[Z' || input === 'k' || input === 'K') {
        setFocusedFieldIndex((prev) =>
          prev <= 0 ? FIELD_ORDER.length - 1 : prev - 1,
        );
        return;
      }

      if (key.downArrow || (key.tab && !key.shift) || input === '\t' || input === 'j' || input === 'J') {
        setFocusedFieldIndex((prev) =>
          prev >= FIELD_ORDER.length - 1 ? 0 : prev + 1,
        );
        return;
      }

      // Space / Arrow Right / Arrow Left -> Cycle discrete options
      if (input === ' ' || key.rightArrow) {
        if (activeField === 'language') {
          onCycleLanguage(1);
          return;
        }
        if (activeField === 'environment') {
          onCycleEnvironment(1);
          return;
        }
        if (activeField === 'plannerAgent') {
          onCyclePlannerAgent(1);
          return;
        }
        if (activeField === 'executorAgent') {
          onCycleExecutorAgent(1);
          return;
        }
        if (activeField === 'intentSource') {
          if (handleOpenSourceModal) {
            handleOpenSourceModal();
          } else {
            onStartEditing();
          }
          return;
        }
        if (activeField === 'saveButton') {
          onSave();
          return;
        }
      }

      if (key.leftArrow) {
        if (activeField === 'language') {
          onCycleLanguage(-1);
          return;
        }
        if (activeField === 'environment') {
          onCycleEnvironment(-1);
          return;
        }
        if (activeField === 'plannerAgent') {
          onCyclePlannerAgent(-1);
          return;
        }
        if (activeField === 'executorAgent') {
          onCycleExecutorAgent(-1);
          return;
        }
        if (activeField === 'intentSource') {
          if (handleOpenSourceModal) {
            handleOpenSourceModal();
          } else {
            onStartEditing();
          }
          return;
        }
      }

      // 'e' -> Custom edit for text-supported fields
      if (input === 'e' || input === 'E') {
        if (
          activeField === 'environment' ||
          activeField === 'plannerAgent' ||
          activeField === 'executorAgent'
        ) {
          onStartCustomEdit();
          return;
        }
        if (activeField === 'hooks') {
          if (onOpenHooksModal) {
            onOpenHooksModal();
          } else {
            onStartEditing();
          }
          return;
        }
        if (activeField === 'intentSource') {
          if (handleOpenSourceModal) {
            handleOpenSourceModal();
          } else {
            onStartEditing();
          }
          return;
        }
      }

      if (activeField === 'hooks') {
        if (
          key.return ||
          input === '\r' ||
          input === '\n' ||
          input === ' ' ||
          key.rightArrow
        ) {
          if (onOpenHooksModal) {
            onOpenHooksModal();
          } else {
            onStartEditing();
          }
          return;
        }
      }

      if (activeField === 'intentSource') {
        if (
          key.return ||
          input === '\r' ||
          input === '\n' ||
          input === ' ' ||
          key.rightArrow
        ) {
          if (handleOpenSourceModal) {
            handleOpenSourceModal();
          } else {
            onStartEditing();
          }
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
