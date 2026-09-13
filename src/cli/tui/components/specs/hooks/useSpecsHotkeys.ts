import { useInput } from 'ink';

export interface UseSpecsHotkeysProps {
  isInteractive?: boolean;
  isModalOpen?: boolean;
  isTextInputActive?: boolean;
  hasSelectedSpec?: boolean;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onOpenRun: () => void;
  onOpenTasks?: () => void;
  onGeneratePlan: () => void;
  onValidatePlan?: () => void;
  onOpenCreateModal: () => void;
  onOpenPullModal: () => void;
  onOpenDeleteModal: () => void;
}

export function useSpecsHotkeys({
  isInteractive = true,
  isModalOpen = false,
  isTextInputActive = false,
  hasSelectedSpec = false,
  onNavigateUp,
  onNavigateDown,
  onOpenRun,
  onOpenTasks,
  onGeneratePlan,
  onValidatePlan,
  onOpenCreateModal,
  onOpenPullModal,
  onOpenDeleteModal,
}: UseSpecsHotkeysProps): void {
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

      // 'c' / 'C' -> Open CreateSpecModal
      if (input === 'c' || input === 'C') {
        onOpenCreateModal();
        return;
      }

      // 'p' / 'P' -> Open PullSpecModal
      if (input === 'p' || input === 'P') {
        onOpenPullModal();
        return;
      }

      // 'd' / 'D' -> Open delete confirmation for the selected specification
      if ((input === 'd' || input === 'D') && hasSelectedSpec) {
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

export default useSpecsHotkeys;
