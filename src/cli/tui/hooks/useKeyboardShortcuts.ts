import { useInput } from 'ink';
import { useNavigation, TabId } from '../context/NavigationContext.js';

export interface UseKeyboardShortcutsOptions {
  onQuit?: () => void;
  enableArrowNav?: boolean;
  isActive?: boolean;
}

const TAB_NUMBER_MAP: Record<string, TabId> = {
  '1': 'specs',
  '2': 'tasks',
  '3': 'run',
  '4': 'docs',
  '5': 'config',
};

/**
 * Global keyboard shortcuts listener for CodeForge TUI.
 * Handles:
 * - Numbers 1-5 for tab switching
 * - Ctrl+K or ':' for Command Palette
 * - 'q' or Ctrl+C for quit confirmation
 * - Left/Right arrows for circular tab navigation
 * - Escape to close modal or command palette
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
    isCommandPaletteOpen,
    openModal,
    closeCommandPalette,
    toggleCommandPalette,
    isTextInputActive,
  } = useNavigation();

  const isEnabled = options.isActive !== false;

  useInput(
    (input, key) => {
      // Suppress all global shortcuts when text input is active
      if (isTextInputActive) {
        return;
      }

      // Handle Escape key to close modal or command palette
      if (key.escape) {
        if (isCommandPaletteOpen) {
          closeCommandPalette();
          return;
        }
        if (modal !== null) {
          closeModal();
          return;
        }
      }

      // Suppress global navigation when modal or command palette is open
      if (modal !== null || isCommandPaletteOpen) {
        return;
      }

      // Command Palette: Ctrl+K or ':'
      const isCtrlK = (key.ctrl && (input === 'k' || input === 'K')) || input === '\x0b';
      if (isCtrlK || input === ':') {
        toggleCommandPalette();
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
