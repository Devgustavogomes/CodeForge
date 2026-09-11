import { useInput } from 'ink';

export interface UseDocsHotkeysOptions {
  isInteractive?: boolean;
  isModalOpen?: boolean;
  isCreateModalOpen?: boolean;
  isUpdateModalOpen?: boolean;
  isTextInputActive?: boolean;
  docsCount: number;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onOpenCreateModal: () => void;
  onOpenUpdateModal?: () => void;
  onUpdateDoc?: () => void;
  onViewDoc?: () => void;
  onClearFeedback?: () => void;
}

export function useDocsHotkeys({
  isInteractive = true,
  isModalOpen = false,
  isCreateModalOpen = false,
  isUpdateModalOpen = false,
  isTextInputActive = false,
  docsCount,
  selectedIndex,
  onSelectIndex,
  onOpenCreateModal,
  onOpenUpdateModal,
  onUpdateDoc,
  onViewDoc,
  onClearFeedback,
}: UseDocsHotkeysOptions): void {
  const modalActive = isModalOpen || isCreateModalOpen || isUpdateModalOpen;

  useInput(
    (input, key) => {
      if (!isInteractive || modalActive || isTextInputActive) {
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

      // 'u' -> Open Update Doc Modal (ignored if docsCount is 0)
      if (input === 'u' || input === 'U') {
        if (docsCount <= 0) {
          return;
        }
        if (onOpenUpdateModal) {
          onOpenUpdateModal();
        } else if (onUpdateDoc) {
          onUpdateDoc();
        }
        return;
      }

      // Enter -> View Doc
      if (key.return || input === '\r' || input === '\n') {
        onViewDoc?.();
        return;
      }
    },
    { isActive: isInteractive && !modalActive }
  );
}

export default useDocsHotkeys;
