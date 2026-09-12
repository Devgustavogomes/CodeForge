import { useState, useCallback } from 'react';
import { useInput } from 'ink';
import { HOOK_EVENTS, HookEvent } from '../../../../../domain/hook.js';

export interface UseHooksEventsViewOptions {
  isActive: boolean;
  onSelectEvent: (event: HookEvent) => void;
  onClose?: () => void;
  selectOnEnter?: boolean;
}

export interface UseHooksEventsViewReturn {
  selectedEventIndex: number;
  setSelectedEventIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedEvent: HookEvent;
  resetEventsView: () => void;
}

/**
 * Sub-hook for Nível 1 (Events View) in ConfigureHooksModal.
 * Controls navigation and selection across the 8 CodeForge lifecycle events.
 */
export function useHooksEventsView({
  isActive,
  onSelectEvent,
  onClose,
  selectOnEnter = true,
}: UseHooksEventsViewOptions): UseHooksEventsViewReturn {
  const [selectedEventIndex, setSelectedEventIndex] = useState<number>(0);

  const selectedEvent: HookEvent =
    HOOK_EVENTS[selectedEventIndex] || HOOK_EVENTS[0];

  const resetEventsView = useCallback(() => {
    setSelectedEventIndex(0);
  }, []);

  useInput(
    (input, key) => {
      if (!isActive) return;

      if (input === 'q' || input === 'Q') {
        onClose?.();
        return;
      }

      if (key.upArrow || input === 'k' || input === 'K') {
        setSelectedEventIndex((prev) =>
          prev > 0 ? prev - 1 : HOOK_EVENTS.length - 1
        );
        return;
      }

      if (key.downArrow || input === 'j' || input === 'J') {
        setSelectedEventIndex((prev) =>
          prev < HOOK_EVENTS.length - 1 ? prev + 1 : 0
        );
        return;
      }

      const isEnter = key.return || input === '\r' || input === '\n';
      if ((selectOnEnter && isEnter) || key.rightArrow) {
        onSelectEvent(selectedEvent);
        return;
      }
    },
    { isActive }
  );

  return {
    selectedEventIndex,
    setSelectedEventIndex,
    selectedEvent,
    resetEventsView,
  };
}
