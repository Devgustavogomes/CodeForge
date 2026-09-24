import { useState, useCallback } from 'react';
import { useInput } from 'ink';
import { HookDefinition } from '../../../../../domain/hook.js';

export interface UseHooksCommandsViewOptions {
  isActive: boolean;
  commands: HookDefinition[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDeleteConfirm: (index: number) => void;
  onBack: () => void;
}

export interface UseHooksCommandsViewReturn {
  selectedCommandIndex: number;
  setSelectedCommandIndex: React.Dispatch<React.SetStateAction<number>>;
  deleteConfirmIndex: number | null;
  setDeleteConfirmIndex: React.Dispatch<React.SetStateAction<number | null>>;
  resetCommandsView: () => void;
}

/**
 * Sub-hook for Nível 2 (Commands View) in ConfigureHooksModal.
 * Controls navigation through event commands, add trigger, edit trigger,
 * and deletion confirmation (y/n).
 */
export function useHooksCommandsView({
  isActive,
  commands,
  onAdd,
  onEdit,
  onDeleteConfirm,
  onBack,
}: UseHooksCommandsViewOptions): UseHooksCommandsViewReturn {
  const [selectedCommandIndex, setSelectedCommandIndex] = useState<number>(0);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  const resetCommandsView = useCallback(() => {
    setSelectedCommandIndex(0);
    setDeleteConfirmIndex(null);
  }, []);

  useInput(
    (input, key) => {
      if (!isActive) return;

      const totalItems = commands.length;

      // Sub-state: deletion confirmation
      if (deleteConfirmIndex !== null) {
        if (input === 'y' || input === 'Y') {
          onDeleteConfirm(deleteConfirmIndex);
          return;
        }
        if (input === 'n' || input === 'N') {
          setDeleteConfirmIndex(null);
          return;
        }
        return;
      }

      // Left arrow navigates back to Nível 1 (Events)
      if (key.leftArrow) {
        onBack();
        return;
      }

      if (key.upArrow || input === 'k' || input === 'K') {
        setSelectedCommandIndex((prev) =>
          prev > 0 ? prev - 1 : totalItems
        );
        return;
      }

      if (key.downArrow || input === 'j' || input === 'J') {
        setSelectedCommandIndex((prev) =>
          prev < totalItems ? prev + 1 : 0
        );
        return;
      }

      if (key.return || input === '\r' || input === '\n') {
        if (selectedCommandIndex === 0) {
          onAdd();
        } else {
          onEdit(selectedCommandIndex - 1);
        }
        return;
      }

      if (input === 'e' || input === 'E') {
        if (selectedCommandIndex > 0) {
          onEdit(selectedCommandIndex - 1);
        }
        return;
      }

      if (input === 'd' || input === 'D' || key.delete) {
        if (selectedCommandIndex > 0) {
          setDeleteConfirmIndex(selectedCommandIndex - 1);
        }
        return;
      }
    },
    { isActive }
  );

  return {
    selectedCommandIndex,
    setSelectedCommandIndex,
    deleteConfirmIndex,
    setDeleteConfirmIndex,
    resetCommandsView,
  };
}
