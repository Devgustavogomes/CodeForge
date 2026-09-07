import React from 'react';
import { Box, Text } from 'ink';
import { useExecution } from '../../context/ExecutionContext.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';

export interface HeaderProps {
  title?: string;
  activeSpec?: string | null;
  breadcrumb?: string;
  shortcuts?: string;
  borderColor?: string;
  borderStyle?: 'round' | 'single' | 'none';
}

/**
 * Top header bar for CodeForge TUI shell.
 * Displays brand title, active spec / breadcrumb, and quick shortcut hints
 * with responsive truncation and modern rounded borders.
 */
export function areHeaderPropsEqual(prev: HeaderProps, next: HeaderProps): boolean {
  return (
    prev.title === next.title &&
    prev.activeSpec === next.activeSpec &&
    prev.breadcrumb === next.breadcrumb &&
    prev.shortcuts === next.shortcuts &&
    prev.borderColor === next.borderColor &&
    prev.borderStyle === next.borderStyle
  );
}

export const Header: React.FC<HeaderProps> = React.memo(({
  title = '⚡ CodeForge',
  activeSpec: propActiveSpec,
  breadcrumb,
  shortcuts,
  borderColor = 'cyan',
  borderStyle = 'round',
}) => {
  const exec = useExecution();
  const { breakpoint } = useTerminalDimensions();
  const currentSpec = propActiveSpec !== undefined ? propActiveSpec : exec.activeSpec;
  const displayBreadcrumb = breadcrumb || (currentSpec ? `Spec: ${currentSpec}` : 'No active spec');
  const defaultShortcuts = '[q] Quit';
  const displayShortcuts = shortcuts !== undefined ? shortcuts : defaultShortcuts;

  const isNoneBorder = borderStyle === 'none';

  return (
    <Box
      borderStyle={isNoneBorder ? undefined : borderStyle}
      borderColor={isNoneBorder ? undefined : borderColor}
      paddingX={isNoneBorder ? 0 : 1}
      justifyContent="space-between"
      width="100%"
    >
      <Box gap={1}>
        <Text bold color="cyan">
          {title}
        </Text>
        {breakpoint !== 'minimal' && (
          <>
            <Text color="gray">│</Text>
            <Text color="white">{displayBreadcrumb}</Text>
          </>
        )}
      </Box>

      {breakpoint === 'wide' && Boolean(displayShortcuts) && (
        <Box>
          <Text dimColor>{displayShortcuts}</Text>
        </Box>
      )}
    </Box>
  );
}, areHeaderPropsEqual);

Header.displayName = 'Header';
