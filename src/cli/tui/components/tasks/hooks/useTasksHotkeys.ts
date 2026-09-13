import { useContext } from 'react';
import { useInput } from 'ink';
import { NavigationContext } from '../../../context/NavigationContext.js';

export interface UseTasksHotkeysProps {
  isInteractive?: boolean;
  isModalOpen?: boolean;
  isSearchingSpec?: boolean;
  onOpenTask?: () => void;
  onNextTask: () => void;
  onPrevTask: () => void;
  onNextSpec: () => void;
  onPrevSpec: () => void;
  onToggleViewJson: () => void;
  onToggleExpand?: () => void;
  onComplete: () => void;
  onReset: () => void;
  onStartSearch?: () => void;
}

export function useTasksHotkeys({
  isInteractive = true,
  isModalOpen = false,
  isSearchingSpec = false,
  onOpenTask,
  onNextTask,
  onPrevTask,
  onNextSpec,
  onPrevSpec,
  onToggleViewJson,
  onToggleExpand,
  onComplete,
  onReset,
  onStartSearch,
}: UseTasksHotkeysProps) {
  const nav = useContext(NavigationContext);

  useInput(
    (input, key) => {
      if (!isInteractive || isModalOpen || nav?.isTextInputActive || isSearchingSpec) return;

      // Start Spec Search: '/'
      if (input === '/') {
        onStartSearch?.();
        return;
      }

      // Open task modal: Enter
      if (key.return || input === '\r' || input === '\n') {
        onOpenTask?.();
        return;
      }

      // Navigate tasks: Up/Down or k/j
      if (key.upArrow || input === 'k') {
        onPrevTask();
        return;
      }
      if (key.downArrow || input === 'j') {
        onNextTask();
        return;
      }

      // Switch spec filter: [ or ] or Left/Right
      if (input === '[' || key.leftArrow) {
        onPrevSpec();
        return;
      }
      if (input === ']' || key.rightArrow) {
        onNextSpec();
        return;
      }

      // Toggle JSON view: 'v' or 'J'
      if (input === 'v' || input === 'J') {
        onToggleViewJson();
        return;
      }

      // Toggle Expand / Collapse view: 'e' or 'E'
      if (input === 'e' || input === 'E') {
        onToggleExpand?.();
        return;
      }

      // Action 'c': Complete task
      if (input === 'c') {
        onComplete();
        return;
      }

      // Action 'x': Reset task
      if (input === 'x') {
        onReset();
        return;
      }
    },
    { isActive: isInteractive && !isModalOpen },
  );
}
