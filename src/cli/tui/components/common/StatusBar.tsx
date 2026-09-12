import React from 'react';
import { Box, Text } from 'ink';
import { TabId, useNavigation } from '../../context/NavigationContext.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { theme } from '../../theme.js';

export interface StatusBarProps {
  activeTab?: TabId;
  hints?: string | string[];
  status?: string;
  error?: string | null;
  borderColor?: string;
  borderStyle?: 'round' | 'single' | 'none';
}

const DEFAULT_HINTS: Record<TabId, string> = {
  run: '↑/↓: Navigate  │  Enter: Run/Resume  │  Tab: View  │  r: Retry  │  c: Complete  │  x/X: Reset  │  w: Wrap',
  specs: '↑/↓: Navigate  │  Enter: Run  │  t: Tasks  │  g: Plan  │  p: Pull  │  c: Create  │  v: Validate',
  tasks: '↑/↓: Navigate  │  c: Complete  │  x: Reset  │  e: Expand  │  /: Search Spec  │  v: View',
  docs: 'c: Create  │  u: Update  │  Enter: View',
  config: '↑/↓: Navigate  │  Enter: Edit',
};

/**
 * StatusBar component rendering bottom bar with context-sensitive key hints
 * and current status / error messages with modern rounded borders.
 */
export function areStatusBarPropsEqual(prev: StatusBarProps, next: StatusBarProps): boolean {
  const hintsEqual =
    Array.isArray(prev.hints) && Array.isArray(next.hints)
      ? prev.hints.length === next.hints.length &&
        prev.hints.every((h, i) => h === (next.hints as string[])[i])
      : prev.hints === next.hints;
  return (
    prev.activeTab === next.activeTab &&
    hintsEqual &&
    prev.status === next.status &&
    prev.error === next.error &&
    prev.borderColor === next.borderColor &&
    prev.borderStyle === next.borderStyle
  );
}

export const StatusBar: React.FC<StatusBarProps> = React.memo(({
  activeTab: propActiveTab,
  hints,
  status,
  error,
  borderColor,
  borderStyle = 'round',
}) => {
  const nav = useNavigation();
  const { breakpoint } = useTerminalDimensions();
  const currentTab = propActiveTab ?? nav.activeTab;

  let hintText: string;
  if (Array.isArray(hints)) {
    hintText = hints.join('  │  ');
  } else if (typeof hints === 'string') {
    hintText = hints;
  } else {
    hintText = DEFAULT_HINTS[currentTab] ?? '';
  }

  const effectiveBorderColor = error
    ? theme.colors.error
    : borderColor ?? theme.colors.borderSubtle;
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
          <Text color={theme.colors.error} bold>
            ✗ {error}
          </Text>
        ) : status ? (
          <Text color={theme.colors.success}>
            ● {status}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}, areStatusBarPropsEqual);

StatusBar.displayName = 'StatusBar';
