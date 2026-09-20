import React, { memo, useState, useEffect, useMemo, useContext } from 'react';
import { Box, Text } from 'ink';
import {
  ActiveHookState,
  HookHistoryItem,
  ExecutionContext,
} from '../../../context/ExecutionContext.js';
import { SupportedLanguage } from '../../../../../config/types.js';
import { theme } from '../../../theme.js';
import { translate } from '../../../../ui/i18n.js';

export interface HooksPanelProps {
  activeHook?: ActiveHookState | null;
  hookHistory?: HookHistoryItem[];
  hasConfiguredHooks?: boolean;
  maxHeight?: number;
  borderStyle?: 'round' | 'single';
  language?: SupportedLanguage;
}

function formatDurationSec(durationMs: number): string {
  const seconds = Math.max(0, durationMs) / 1000;
  return `${seconds.toFixed(1)}s`;
}

export const HooksPanel: React.FC<HooksPanelProps> = memo(({
  activeHook: propActiveHook,
  hookHistory: propHookHistory,
  hasConfiguredHooks: propHasConfiguredHooks,
  maxHeight,
  borderStyle = 'round',
  language = 'en',
}) => {
  const exec = useContext(ExecutionContext);
  const activeHook = propActiveHook !== undefined ? propActiveHook : exec?.activeHook ?? null;
  const hookHistory = propHookHistory !== undefined ? propHookHistory : exec?.hookHistory ?? [];
  const hasConfiguredHooks =
    propHasConfiguredHooks !== undefined
      ? propHasConfiguredHooks
      : exec?.hasConfiguredHooks ?? true;

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeHook) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => clearInterval(timer);
  }, [activeHook?.startedAt, Boolean(activeHook)]);

  const elapsed = activeHook
    ? `${(Math.max(0, now - activeHook.startedAt) / 1000).toFixed(1)}s`
    : '0.0s';

  const boxTitle = translate('tui_hooks_box_title', language);
  const headerText = activeHook ? `${boxTitle} (Active: 1)` : boxTitle;
  const effectiveBorderColor = activeHook
    ? theme.colors.borderActive
    : theme.colors.borderSubtle;

  const historyToDisplay = useMemo(() => {
    if (!hookHistory || hookHistory.length === 0) return [];
    if (maxHeight !== undefined) {
      const fixedLines = 2 + 1 + (activeHook ? 3 : 1) + 2;
      const available = Math.max(1, maxHeight - fixedLines);
      return hookHistory.slice(0, Math.min(hookHistory.length, available));
    }
    return hookHistory.slice(0, 5);
  }, [hookHistory, maxHeight, activeHook]);

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={effectiveBorderColor}
      paddingX={1}
      width="100%"
      overflow="hidden"
      maxHeight={maxHeight}
    >
      {/* Box Header */}
      <Box justifyContent="space-between" width="100%" marginBottom={0} flexShrink={0}>
        <Text bold color={activeHook ? theme.colors.accent : theme.colors.muted}>
          {headerText}
        </Text>
      </Box>

      {/* Active Hook / Inactive State */}
      {activeHook ? (
        <Box flexDirection="column" width="100%" marginY={0} flexShrink={0}>
          <Box flexDirection="row" width="100%">
            <Text color={theme.colors.accent} bold>▶ </Text>
            <Text color={theme.colors.textDim}>[{activeHook.event}] </Text>
            <Text bold color={theme.colors.text}>{activeHook.name} </Text>
            <Text
              bold
              color={activeHook.type === 'gate' ? theme.colors.warning : theme.colors.accent}
            >
              {activeHook.type === 'gate'
                ? translate('tui_hooks_badge_gate', language)
                : translate('tui_hooks_badge_notify', language)}
            </Text>
          </Box>
          <Box width="100%">
            <Text dimColor>  {translate('tui_hooks_command_label', language)} </Text>
            <Text wrap="truncate-end">{activeHook.command}</Text>
          </Box>
          <Box width="100%">
            <Text dimColor>  {translate('tui_hooks_elapsed_label', language)} </Text>
            <Text color={theme.colors.text}>{elapsed}</Text>
          </Box>
        </Box>
      ) : !hasConfiguredHooks ? (
        <Box width="100%" flexShrink={0}>
          <Text dimColor color={theme.colors.muted}>
            {translate('tui_hooks_none_configured', language)}
          </Text>
        </Box>
      ) : (
        <Box width="100%" flexShrink={0}>
          <Text dimColor color={theme.colors.muted}>
            {translate('tui_hooks_idle', language)}
          </Text>
        </Box>
      )}

      {/* Recent History Section */}
      {historyToDisplay.length > 0 && (
        <Box flexDirection="column" width="100%" flexShrink={0}>
          <Box
            borderStyle="single"
            borderTop={true}
            borderBottom={false}
            borderLeft={false}
            borderRight={false}
            borderColor={theme.colors.borderSubtle}
            width="100%"
            marginY={0}
            flexShrink={0}
          />
          <Box width="100%" marginBottom={0} flexShrink={0}>
            <Text bold dimColor>
              {translate('tui_hooks_recent_title', language)}
            </Text>
          </Box>
          {historyToDisplay.map((item) => (
            <Box key={item.id} flexDirection="column" width="100%" flexShrink={0}>
              <Box flexDirection="row" width="100%">
                <Text color={item.ok ? theme.colors.success : theme.colors.error} bold>
                  {item.ok ? '✔ ' : '✖ '}
                </Text>
                <Text color={theme.colors.textDim}>[{item.event}] </Text>
                <Text color={theme.colors.text}>{item.name} </Text>
                <Text dimColor>
                  {item.ok
                    ? `(${formatDurationSec(item.durationMs)})`
                    : `(exit ${item.exitCode !== null && item.exitCode !== undefined ? item.exitCode : 1})`}
                </Text>
                {item.type === 'gate' && (
                  <Text
                    bold
                    color={item.ok ? theme.colors.warning : theme.colors.error}
                  >
                    {' '}{translate('tui_hooks_badge_gate', language)}
                  </Text>
                )}
              </Box>
              {Boolean(!item.ok && item.outputSummary) && (
                <Box paddingLeft={2} width="100%">
                  <Text color={theme.colors.error} wrap="truncate-end">
                    ↳ {item.outputSummary}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
});

HooksPanel.displayName = 'HooksPanel';
export default HooksPanel;
