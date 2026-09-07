import { useInput } from 'ink';

export interface UseDocsHotkeysOptions {
  isInteractive?: boolean;
  isModalOpen?: boolean;
  isTextInputActive?: boolean;
  docsCount: number;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onOpenCreateModal: () => void;
  onUpdateDoc: () => void;
  onViewDoc?: () => void;
  onClearFeedback?: () => void;
}

export function useDocsHotkeys({
  isInteractive = true,
  isModalOpen = false,
  isTextInputActive = false,
  docsCount,
  selectedIndex,
  onSelectIndex,
  onOpenCreateModal,
  onUpdateDoc,
  onViewDoc,
  onClearFeedback,
}: UseDocsHotkeysOptions): void {
  useInput(
    (input, key) => {
      if (!isInteractive || isModalOpen || isTextInputActive) {
        return;
      }

      // Navigate doc list: Up or k
      if (key.upArrow || input === 'k') {
        onSelectIndex(selectedIndex > 0 ? selectedIndex - 1 : Math.max(0, docsCount - 1));
        onClearFeedback?.();
        return;
      }

      // Navigate doc list: Down or j
      if (key.downArrow || input === 'j') {
        onSelectIndex(selectedIndex < docsCount - 1 ? selectedIndex + 1 : 0);
        onClearFeedback?.();
        return;
      }

      // 'c' -> Open Create Doc Modal
      if (input === 'c' || input === 'C') {
        onOpenCreateModal();
        return;
      }

      // 'u' -> Update Doc UseCase
      if (input === 'u' || input === 'U') {
        onUpdateDoc();
        return;
      }

      // Enter -> View Doc
      if (key.return || input === '\r' || input === '\n') {
        onViewDoc?.();
        return;
      }
    },
    { isActive: isInteractive && !isModalOpen }
  );
}

export default useDocsHotkeys;
