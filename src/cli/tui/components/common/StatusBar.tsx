import React, { useContext, useMemo } from 'react';
import { Box, Text } from 'ink';
import { TabId, useNavigation } from '../../context/NavigationContext.js';
import { ContainerContext } from '../../context/ContainerContext.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { theme } from '../../theme.js';
import { translate, TranslationKey } from '../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../config/types.js';

export interface StatusBarProps {
  activeTab?: TabId;
  hints?: string | string[];
  status?: string;
  error?: string | null;
  borderColor?: string;
  borderStyle?: 'round' | 'single' | 'none';
  language?: SupportedLanguage;
}

/**
 * StatusBar component rendering bottom bar with context-sensitive key hints
 * and current status / error messages using universal ASCII markers and rounded borders.
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
    prev.borderStyle === next.borderStyle &&
    prev.language === next.language
  );
}

export const StatusBar: React.FC<StatusBarProps> = React.memo(({
  activeTab: propActiveTab,
  hints,
  status,
  error,
  borderColor,
  borderStyle = 'round',
  language: propLanguage,
}) => {
  const nav = useNavigation();
  const container = useContext(ContainerContext);
  const resolvedLanguage: SupportedLanguage = useMemo(() => {
    if (propLanguage) return propLanguage;
    try {
      return container?.configService?.loadConfig?.()?.language ?? 'en';
    } catch {
      return 'en';
    }
  }, [propLanguage, container]);

  const { breakpoint } = useTerminalDimensions();
  const currentTab = propActiveTab ?? nav.activeTab;

  let hintText: string;
  if (Array.isArray(hints)) {
    hintText = hints.join('  │  ');
  } else if (typeof hints === 'string') {
    hintText = hints;
  } else {
    const hintKey = `tui_status_hints_${currentTab}` as TranslationKey;
    hintText = translate(hintKey, resolvedLanguage);
  }

  const effectiveBorderColor = error
    ? theme.colors.error
    : borderColor ?? theme.colors.borderSubtle;
  const isNoneBorder = borderStyle === 'none';

  // Format status message with a safe universal ASCII marker
  const formattedStatus = status
    ? (status.startsWith('[') ? status : `[v] ${status}`)
    : null;

  // Format error message with safe ASCII [x] marker
  const formattedError = error
    ? (error.startsWith('[x]') ? error : `[x] ${error}`)
    : null;

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
          <Text dimColor>{translate('tui_status_minimal_hints', resolvedLanguage)}</Text>
        )}
      </Box>

      <Box flexShrink={0} paddingLeft={1}>
        {formattedError ? (
          <Text color={theme.colors.error} bold>
            {formattedError}
          </Text>
        ) : formattedStatus ? (
          <Text color={theme.colors.success}>
            {formattedStatus}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}, areStatusBarPropsEqual);

StatusBar.displayName = 'StatusBar';
