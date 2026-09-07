import React from 'react';
import { Box, Text } from 'ink';
import { TabId, useNavigation } from '../../context/NavigationContext.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';

export interface StatusBarProps {
  activeTab?: TabId;
  hints?: string | string[];
  status?: string;
  error?: string | null;
  borderColor?: string;
  borderStyle?: 'round' | 'single' | 'none';
}

const DEFAULT_HINTS: Record<TabId, string> = {
  run: '↑/↓: Navigate  │  Tab: Switch View  │  r: Retry  │  c: Complete  │  x: Reset',
  specs: '↑/↓: Navigate  │  Enter: Open Run  │  c: Create  │  p: Pull  │  g: Plan  │  v: Validate',
  tasks: '↑/↓: Navigate  │  r: Retry  │  c: Complete  │  x: Reset  │  Enter: Info',
  docs: 'c: Create  │  u: Update  │  Enter: View',
  config: '↑/↓: Navigate  │  Enter: Edit',
};

/**
 * StatusBar component rendering bottom bar with context-sensitive key hints
 * and current status / error messages with modern rounded borders.
 */
export const StatusBar: React.FC<StatusBarProps> = ({
  activeTab: propActiveTab,
  hints,
  status,
  error,
  borderColor,
  borderStyle = 'round',
}) => {
  let navActiveTab: TabId = 'run';
  try {
    const nav = useNavigation();
    navActiveTab = nav.activeTab;
  } catch {
    // Outside NavigationProvider
  }

  const { breakpoint } = useTerminalDimensions();
  const currentTab = propActiveTab ?? navActiveTab;

  let hintText: string;
  if (Array.isArray(hints)) {
    hintText = hints.join('  │  ');
  } else if (typeof hints === 'string') {
    hintText = hints;
  } else {
    hintText = DEFAULT_HINTS[currentTab] ?? '';
  }

  const effectiveBorderColor = borderColor ?? (error ? 'red' : 'gray');
  const isNoneBorder = borderStyle === 'none';

  return (
    <Box
      borderStyle={isNoneBorder ? undefined : borderStyle}
      borderColor={isNoneBorder ? undefined : effectiveBorderColor}
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      <Box flexShrink={1}>
        {breakpoint !== 'minimal' ? (
          <Text dimColor wrap="truncate-end">{hintText}</Text>
        ) : (
          <Text dimColor>[1-5] Tabs  [q] Quit</Text>
        )}
      </Box>

      <Box flexShrink={0} paddingLeft={1}>
        {error ? (
          <Text color="red" bold>
            ✗ {error}
          </Text>
        ) : status ? (
          <Text color="green">
            ● {status}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
};
