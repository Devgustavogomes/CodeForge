import { useContext } from 'react';
import { useInput } from 'ink';
import { NavigationContext } from '../../../context/NavigationContext.js';

export interface UseTasksHotkeysProps {
  isInteractive?: boolean;
  onNextTask: () => void;
  onPrevTask: () => void;
  onNextSpec: () => void;
  onPrevSpec: () => void;
  onToggleViewJson: () => void;
  onComplete: () => void;
  onRetry: () => void;
  onReset: () => void;
}

export function useTasksHotkeys({
  isInteractive = true,
  onNextTask,
  onPrevTask,
  onNextSpec,
  onPrevSpec,
  onToggleViewJson,
  onComplete,
  onRetry,
  onReset,
}: UseTasksHotkeysProps) {
  const nav = useContext(NavigationContext);

  useInput(
    (input, key) => {
      if (!isInteractive || nav?.isTextInputActive) return;

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

      // Action 'c': Complete task
      if (input === 'c') {
        onComplete();
        return;
      }

      // Action 'r': Retry task
      if (input === 'r') {
        onRetry();
        return;
      }

      // Action 'x': Reset task
      if (input === 'x') {
        onReset();
        return;
      }
    },
    { isActive: isInteractive },
  );
}
