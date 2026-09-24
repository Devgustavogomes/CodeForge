import { useInput } from 'ink';

export interface UseIntentsHotkeysProps {
  isInteractive?: boolean;
  isModalOpen?: boolean;
  isTextInputActive?: boolean;
  hasSelectedIntent?: boolean;  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onOpenRun: () => void;
  onOpenTasks?: () => void;
  onGeneratePlan: () => void;
  onValidatePlan?: () => void;
  onOpenCreateModal: () => void;
  onOpenPullModal: () => void;
  onOpenDeleteModal: () => void;
}
export function useIntentsHotkeys({
  isInteractive = true,
  isModalOpen = false,
  isTextInputActive = false,
  hasSelectedIntent,
    onNavigateUp,
  onNavigateDown,
  onOpenRun,
  onOpenTasks,
  onGeneratePlan,
  onValidatePlan,
  onOpenCreateModal,
  onOpenPullModal,
  onOpenDeleteModal,
}: UseIntentsHotkeysProps): void {
  const hasSelected = hasSelectedIntent ?? false;

  useInput(
    (input, key) => {
      if (!isInteractive || isModalOpen || isTextInputActive) {
        return;
      }

      // Navigate list: Up/Down or k/j
      if (key.upArrow || input === 'k') {
        onNavigateUp();
        return;
      }
      if (key.downArrow || input === 'j') {
        onNavigateDown();
        return;
      }

      // 'c' / 'C' -> Open CreateIntentModal
      if (input === 'c' || input === 'C') {
        onOpenCreateModal();
        return;
      }

      // 'p' / 'P' -> Open PullIntentModal
      if (input === 'p' || input === 'P') {
        onOpenPullModal();
        return;
      }

      // 'd' / 'D' -> Open delete confirmation for the selected intent
      if ((input === 'd' || input === 'D') && hasSelected) {
        onOpenDeleteModal();
        return;
      }

      // 'g' / 'G' -> Generate plan
      if (input === 'g' || input === 'G') {
        onGeneratePlan();
        return;
      }

      // 't' / 'T' -> Open in Tasks
      if (input === 't' || input === 'T') {
        onOpenTasks?.();
        return;
      }

      // 'v' -> Validate plan
      if (input === 'v' || input === 'V') {
        onValidatePlan?.();
        return;
      }

      // Enter -> Open in Run dashboard
      if (key.return || input === '\r' || input === '\n') {
        onOpenRun();
        return;
      }
    },
    { isActive: isInteractive && !isModalOpen && !isTextInputActive }
  );
}

export default useIntentsHotkeys;
