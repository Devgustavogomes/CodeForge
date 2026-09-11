import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { useInput } from 'ink';
import { NavigationContext } from '../context/NavigationContext.js';

export interface UseTextInputOptions {
  initialValue?: string;
  isActive?: boolean;
  onChange?: (val: string) => void;
  onSubmit?: (val: string) => void;
  onCancel?: () => void;
  syncNavigation?: boolean;
}

export interface UseTextInputReturn {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  clear: () => void;
}

/**
 * Headless hook to manage text editing in Ink-based TUIs.
 * Handles typing, backspace, delete, Ctrl+U (clear), Enter (submit), Esc (cancel),
 * and automatic synchronization with NavigationContext.setTextInputActive.
 */
export function useTextInput(options: UseTextInputOptions = {}): UseTextInputReturn {
  const {
    initialValue = '',
    isActive = true,
    onChange,
    onSubmit,
    onCancel,
    syncNavigation = false,
  } = options;

  const [value, setValue] = useState<string>(initialValue);

  const valueRef = useRef(value);
  valueRef.current = value;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const nav = useContext(NavigationContext);

  // Synchronize navigation textInputActive flag when enabled
  useEffect(() => {
    if (!syncNavigation || !nav?.setTextInputActive) {
      return;
    }
    nav.setTextInputActive(isActive);
    return () => {
      nav.setTextInputActive(false);
    };
  }, [syncNavigation, isActive, nav]);

  const setValueWithChange: React.Dispatch<React.SetStateAction<string>> = useCallback(
    (action) => {
      setValue((prev) => {
        const next = typeof action === 'function' ? (action as (prev: string) => string)(prev) : action;
        valueRef.current = next;
        onChangeRef.current?.(next);
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => {
    setValueWithChange('');
  }, [setValueWithChange]);

  useInput(
    (input, key) => {
      if (!isActive) {
        return;
      }

      // Escape: cancel / dismiss
      if (key.escape || input === '\u001B') {
        onCancelRef.current?.();
        return;
      }

      // Enter / Return: submit
      if (key.return || input === '\r' || input === '\n') {
        onSubmitRef.current?.(valueRef.current);
        return;
      }

      // Backspace / Delete: remove last character
      if (key.backspace || key.delete || input === '\x08' || input === '\x7f') {
        setValueWithChange((prev) => prev.slice(0, -1));
        return;
      }

      // Ctrl+U: clear input
      if ((key.ctrl && (input === 'u' || input === 'U')) || input === '\x15') {
        clear();
        return;
      }

      // Printable characters
      if (!key.ctrl && !key.meta) {
        const printable = input
          .split('')
          .filter((ch) => {
            const code = ch.charCodeAt(0);
            return (code >= 32 && code !== 127) || code > 127;
          })
          .join('');

        if (printable.length > 0) {
          setValueWithChange((prev) => prev + printable);
        }
      }
    },
    { isActive },
  );

  return {
    value,
    setValue: setValueWithChange,
    clear,
  };
}
