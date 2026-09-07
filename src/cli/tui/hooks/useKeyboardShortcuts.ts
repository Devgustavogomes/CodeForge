import { useInput } from 'ink';
import { useNavigation, TabId } from '../context/NavigationContext.js';

export interface UseKeyboardShortcutsOptions {
  onQuit?: () => void;
  enableArrowNav?: boolean;
  isActive?: boolean;
}

const TAB_NUMBER_MAP: Record<string, TabId> = {
  '1': 'run',
  '2': 'specs',
  '3': 'tasks',
  '4': 'docs',
  '5': 'config',
};

/**
 * Global keyboard shortcuts listener for CodeForge TUI.
 * Handles:
 * - Numbers 1-5 for tab switching (1: Run, 2: Specs, 3: Tasks, 4: Docs, 5: Config)
 * - 'q' or Ctrl+C for quit confirmation
 * - Left/Right arrows for circular tab navigation
 * - Escape to close active modal
 *
 * Suppresses global navigation when a modal or text input is active.
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}): void {
  const {
    setActiveTab,
    nextTab,
    prevTab,
    modal,
    closeModal,
    openModal,
    isTextInputActive,
  } = useNavigation();

  const isEnabled = options.isActive !== false;

  useInput(
    (input, key) => {
      // Suppress all global shortcuts when text input is active
      if (isTextInputActive) {
        return;
      }

      // Handle Escape key to close modal
      if (key.escape) {
        if (modal !== null) {
          closeModal();
          return;
        }
      }

      // Suppress global navigation when modal is open
      if (modal !== null) {
        return;
      }

      // Quit: 'q' or Ctrl+C
      const isQuit = input === 'q' || input === 'Q' || (key.ctrl && (input === 'c' || input === 'C'));
      if (isQuit) {
        if (options.onQuit) {
          options.onQuit();
        } else {
          openModal('quit_confirm');
        }
        return;
      }

      // Tab switching via numbers 1-5
      const targetTab = TAB_NUMBER_MAP[input];
      if (targetTab) {
        setActiveTab(targetTab);
        return;
      }

      // Left/Right arrow tab navigation (enabled by default)
      if (options.enableArrowNav !== false) {
        if (key.leftArrow) {
          prevTab();
          return;
        }
        if (key.rightArrow) {
          nextTab();
          return;
        }
      }
    },
    { isActive: isEnabled }
  );
}
