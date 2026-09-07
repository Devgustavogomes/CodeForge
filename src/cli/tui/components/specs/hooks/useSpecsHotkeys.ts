import { useInput } from 'ink';

export interface UseSpecsHotkeysProps {
  isInteractive?: boolean;
  isModalOpen?: boolean;
  isTextInputActive?: boolean;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onOpenRun: () => void;
  onGeneratePlan: () => void;
  onValidatePlan?: () => void;
  onOpenCreateModal: () => void;
  onOpenPullModal: () => void;
}

export function useSpecsHotkeys({
  isInteractive = true,
  isModalOpen = false,
  isTextInputActive = false,
  onNavigateUp,
  onNavigateDown,
  onOpenRun,
  onGeneratePlan,
  onValidatePlan,
  onOpenCreateModal,
  onOpenPullModal,
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

      // 'P' -> Open PullSpecModal
      if (input === 'P') {
        onOpenPullModal();
        return;
      }

      // 'p' / 'g' -> Generate plan
      if (input === 'p' || input === 'g' || input === 'G') {
        onGeneratePlan();
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
