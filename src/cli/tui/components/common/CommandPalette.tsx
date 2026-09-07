import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigation, TabId } from '../../context/NavigationContext.js';
import {
  CommandActionItem,
  COMMAND_REGISTRY,
  CATEGORY_COLORS,
  filterCommands,
  CommandActionContext,
} from './commandRegistry.js';

export interface CommandPaletteProps {
  isOpen?: boolean;
  onClose?: () => void;
  commands?: readonly CommandActionItem[];
  onSelect?: (command: CommandActionItem) => void;
  width?: number;
}

const MAX_VISIBLE_ITEMS = 8;

/**
 * Command Palette modal component allowing users to fuzzy-search and execute
 * any CodeForge CLI command or subcommand from anywhere in the TUI.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  commands,
  onSelect,
  width = 68,
}) => {
  let nav: ReturnType<typeof useNavigation> | undefined;
  try {
    nav = useNavigation();
  } catch {
    // Outside NavigationProvider fallback
  }

  const setTextInputActive = nav?.setTextInputActive;
  const isCommandPaletteOpen = nav?.isCommandPaletteOpen ?? false;
  const effectiveIsOpen = isOpen !== undefined ? isOpen : isCommandPaletteOpen;

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const prevIsOpenRef = React.useRef(effectiveIsOpen);

  // Sync focus and text-input state with NavigationContext
  useEffect(() => {
    if (effectiveIsOpen && !prevIsOpenRef.current) {
      setQuery('');
      setSelectedIndex(0);
    }
    prevIsOpenRef.current = effectiveIsOpen;

    if (effectiveIsOpen) {
      setTextInputActive?.(true);
    } else {
      setTextInputActive?.(false);
    }

    return () => {
      setTextInputActive?.(false);
    };
  }, [effectiveIsOpen, setTextInputActive]);

  const availableCommands = commands ?? COMMAND_REGISTRY;

  // Filter commands using fuzzy matching
  const filteredCommands = useMemo(() => {
    return filterCommands(availableCommands, query);
  }, [availableCommands, query]);

  const safeSelectedIndex = filteredCommands.length > 0
    ? Math.min(selectedIndex, filteredCommands.length - 1)
    : 0;

  const handleClose = useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
    setTextInputActive?.(false);
    onClose?.();
    nav?.closeCommandPalette();
  }, [nav, onClose, setTextInputActive]);

  const handleSelect = useCallback(
    (cmdToSelect?: CommandActionItem) => {
      const selected = cmdToSelect ?? filteredCommands[safeSelectedIndex];
      if (!selected) {
        return;
      }

      handleClose();

      if (onSelect) {
        onSelect(selected);
      }

      const actionContext: CommandActionContext = {
        navigate: (tab: TabId) => nav?.setActiveTab(tab),
        setActiveTab: (tab: TabId) => nav?.setActiveTab(tab),
        openModal: (type: string, props?: Record<string, unknown>) => nav?.openModal(type, props),
        closeModal: () => nav?.closeModal(),
        closePalette: () => handleClose(),
        activeSpec: nav?.activeSpec ?? null,
        setActiveSpec: (spec: string | null) => nav?.setActiveSpec(spec),
      };

      try {
        void selected.action(actionContext);
      } catch (err) {
        console.error('Failed to execute command action:', err);
      }
    },
    [filteredCommands, safeSelectedIndex, handleClose, onSelect, nav]
  );

  useInput(
    (input, key) => {
      // 1. Escape key -> dismiss palette without action
      if (key.escape || input === '\u001B') {
        handleClose();
        return;
      }

      // 2. Enter key -> dispatch selected action and close
      if (key.return || input === '\r' || input === '\n') {
        handleSelect();
        return;
      }

      // 3. Navigate Down (↓, Ctrl+J, Ctrl+N, Tab, or 'j' when search is empty)
      const isDown =
        key.downArrow ||
        input === '\u001B[B' ||
        (key.ctrl && (input === 'j' || input === 'n')) ||
        (!key.shift && key.tab) ||
        (!key.ctrl && !key.meta && input === 'j' && query === '');

      if (isDown) {
        if (filteredCommands.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
        }
        return;
      }

      // 4. Navigate Up (↑, Ctrl+K, Ctrl+P, Shift+Tab, or 'k' when search is empty)
      const isUp =
        key.upArrow ||
        input === '\u001B[A' ||
        (key.ctrl && (input === 'k' || input === 'p')) ||
        (key.shift && key.tab) ||
        (!key.ctrl && !key.meta && input === 'k' && query === '');

      if (isUp) {
        if (filteredCommands.length > 0) {
          setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        }
        return;
      }

      // 5. Backspace / Delete
      if (key.backspace || key.delete || input === '\x08' || input === '\x7f') {
        setQuery((prev) => prev.slice(0, -1));
        setSelectedIndex(0);
        return;
      }

      // 6. Ctrl+U or Ctrl+W: clear search
      if (key.ctrl && (input === 'u' || input === 'w')) {
        setQuery('');
        setSelectedIndex(0);
        return;
      }

      // 7. Regular character typing
      if (!key.ctrl && !key.meta) {
        const printable = input
          .split('')
          .filter((ch) => {
            const code = ch.charCodeAt(0);
            return (code >= 32 && code !== 127) || code > 127;
          })
          .join('');

        if (printable.length > 0) {
          setQuery((prev) => prev + printable);
          setSelectedIndex(0);
        }
      }
    },
    { isActive: effectiveIsOpen }
  );

  if (!effectiveIsOpen) {
    return null;
  }

  // Calculate sliding window for scrolling
  const startIndex = Math.max(
    0,
    Math.min(
      safeSelectedIndex - Math.floor(MAX_VISIBLE_ITEMS / 2),
      Math.max(0, filteredCommands.length - MAX_VISIBLE_ITEMS)
    )
  );
  const visibleCommands = filteredCommands.slice(startIndex, startIndex + MAX_VISIBLE_ITEMS);

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        width={width}
      >
        {/* Header bar */}
        <Box marginBottom={1} justifyContent="space-between" width="100%">
          <Text bold color="cyan">
            Command Palette
          </Text>
          <Text dimColor>[Esc] Close</Text>
        </Box>

        {/* Search input field */}
        <Box
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginBottom={1}
          justifyContent="flex-start"
        >
          <Text color="cyan" bold>{'> '}</Text>
          {query.length > 0 ? (
            <Text bold color="white">
              {query}
            </Text>
          ) : (
            <Text dimColor>Type to search commands...</Text>
          )}
        </Box>

        {/* Filtered command results list */}
        {filteredCommands.length === 0 ? (
          <Box paddingY={1} justifyContent="center">
            <Text dimColor>No matching commands found</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {visibleCommands.map((cmd, idx) => {
              const actualIndex = startIndex + idx;
              const isSelected = actualIndex === safeSelectedIndex;
              const badge = `[${cmd.category.toUpperCase()}]`.padEnd(8, ' ');
              const categoryColor = CATEGORY_COLORS[cmd.category] ?? 'white';

              return (
                <Box
                  key={cmd.id}
                  flexDirection="column"
                >
                  <Box justifyContent="space-between" width="100%">
                    <Box>
                      <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                        {isSelected ? '❯ ' : '  '}
                      </Text>
                      <Text color={categoryColor} bold>
                        {badge}
                      </Text>
                      <Text bold={isSelected} color={isSelected ? 'white' : undefined}>
                        {cmd.title}
                      </Text>
                    </Box>
                    {cmd.shortcutHint ? (
                      <Box>
                        <Text dimColor>{`[${cmd.shortcutHint}]`}</Text>
                      </Box>
                    ) : null}
                  </Box>
                  <Box paddingLeft={10}>
                    <Text dimColor wrap="truncate-end">
                      {cmd.description}
                    </Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}

        {/* Footer info and navigation hint */}
        <Box
          marginTop={1}
          paddingTop={1}
          borderStyle="single"
          borderTop={true}
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
          borderColor="gray"
          justifyContent="space-between"
          width="100%"
        >
          <Text dimColor>
            {filteredCommands.length > 0
              ? `${safeSelectedIndex + 1} of ${filteredCommands.length} commands`
              : '0 commands'}
          </Text>
          <Text dimColor>↑/↓ Navigate · Enter Select</Text>
        </Box>
      </Box>
    </Box>
  );
};
