import React, { useContext, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useExecution } from '../../context/ExecutionContext.js';
import { ContainerContext } from '../../context/ContainerContext.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { theme } from '../../theme.js';
import { translate } from '../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../config/types.js';

export interface HeaderProps {
  title?: string;
  activeIntent?: string | null;  breadcrumb?: string;
  shortcuts?: string;
  borderColor?: string;
  borderStyle?: 'round' | 'single' | 'none';
  language?: SupportedLanguage;
}

/**
 * Top header bar for CodeForge TUI shell.
 * Displays brand title, active intent / breadcrumb, and quick shortcut hints
 * with responsive truncation and modern rounded borders.
 */
export function areHeaderPropsEqual(prev: HeaderProps, next: HeaderProps): boolean {
  return (
    prev.title === next.title &&
    prev.activeIntent === next.activeIntent &&
    prev.activeIntent === next.activeIntent &&
    prev.breadcrumb === next.breadcrumb &&
    prev.shortcuts === next.shortcuts &&
    prev.borderColor === next.borderColor &&
    prev.borderStyle === next.borderStyle &&
    prev.language === next.language
  );
}

export const Header: React.FC<HeaderProps> = React.memo(({
  title: propTitle,
  activeIntent: propActiveIntent,
    breadcrumb,
  shortcuts,
  borderColor = theme.colors.borderSubtle,
  borderStyle = 'round',
  language: propLanguage,
}) => {
  const container = useContext(ContainerContext);
  const resolvedLanguage: SupportedLanguage = useMemo(() => {
    if (propLanguage) return propLanguage;
    try {
      return container?.configService?.loadConfig?.()?.language ?? 'en';
    } catch {
      return 'en';
    }
  }, [propLanguage, container]);

  const exec = useExecution();
  const { breakpoint } = useTerminalDimensions();

  const title =
    propTitle !== undefined
      ? propTitle
      : translate('tui_header_title', resolvedLanguage);

  const currentIntent =
    propActiveIntent !== undefined
      ? propActiveIntent
      : propActiveIntent !== undefined
        ? propActiveIntent
        : (exec.activeIntent ?? exec.activeIntent);

  const displayBreadcrumb =
    breadcrumb ||
    (currentIntent
      ? `Intent: ${currentIntent}`
      : translate('tui_header_no_active_intent', resolvedLanguage));

  const defaultShortcuts = translate('tui_header_shortcuts', resolvedLanguage);
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
        <Text bold color={theme.colors.primary}>
          {title}
        </Text>
        {breakpoint !== 'minimal' && (
          <>
            <Text color={theme.colors.borderSubtle}>│</Text>
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
